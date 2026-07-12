-- Slice 3, Đợt 1: backend commit path for re-importing into an EXISTING
-- story (PRD §8.3/§10/FR-07). import_jobs.story_id, chapters.source_key and
-- chapters.archived_in_version_id were already added in 0004 in
-- anticipation of this — nothing has written to them until now.
--
-- This is a SIBLING RPC (commit_reimport_job), not a modification of
-- commit_import_job: 0005->0006 already had to drop+recreate that function
-- once to close a trust-boundary gap, so extending a hardened, tested RPC
-- in place for an unrelated flow is avoided on purpose. commit_import_job
-- keeps doing exactly one thing (create a brand-new story); this one keeps
-- doing exactly one thing (fold a new draft into an existing story).
--
-- Chapter-matching (source_key -> title+position -> paragraph fingerprint)
-- runs client/server-side in TS (lib/import/reimport-match.ts) against the
-- job's target story and gets persisted as import_jobs.mapping_json before
-- commit — same "client proposes, server re-validates" split already used
-- for draft_json (see 0006's header comment). This RPC never trusts
-- mapping_json's shape of the *result* (which old chapter maps to which
-- new one) — it only trusts well-formed JSON and re-derives/re-checks the
-- one invariant that actually matters for data integrity: every currently
-- active chapter has exactly one disposition (kept, merged-away, or
-- archived) before anything is written.
--
-- mapping_json shape:
-- {
--   "version": 1,
--   "baseTreeToken": "<timestamptz ISO string>",
--   "decisions": [
--     { "kind": "primary", "newChapterId": "...", "oldChapterId": "..." },
--     { "kind": "merged",  "newChapterId": "...", "oldChapterId": "..." },
--     { "kind": "archived", "oldChapterId": "..." }
--   ],
--   "sections": [ { "newSectionId": "...", "oldSectionId": "..." } ]
-- }
-- "primary": the old chapter's identity/history continues as this new
--   chapter (new revision only if content_hash actually changed).
-- "merged": this old chapter is folded into another chapter's primary
--   mapping and archived here; Đợt 2 uses the returned chapter_id_pairs to
--   best-effort remap its reading progress into the primary's revision.
-- "archived": explicitly confirmed as removed, no surviving new chapter.
-- Every section/chapter not covered by a "primary"/reuse mapping is
-- inserted fresh, exactly like commit_import_job does today.
--
-- Staleness: baseTreeToken is the greatest(updated_at) across the story's
-- active chapters/sections at the moment the mapping was computed (not a
-- content hash — recomputing hashContentBlocks in SQL is the same risk
-- 0006 already declined to take). If the story changed since, this RPC
-- rejects with a distinct error code so the caller can prompt "reload the
-- review page" instead of committing against a stale plan.
--
-- Story identity/section identity are versioned via the existing "live
-- tree" (chapters.is_active/current_revision_id, sections.is_active) rather
-- than adding a story_versions.structure_snapshot column PRD §11.4
-- describes — no P0 acceptance criterion needs browsing an old version's
-- exact historical tree shape, only that the CURRENT tree ends up correct
-- and old chapter_revisions rows survive as history, which this already
-- gets from revision reuse (no new revision when content_hash is
-- unchanged) plus archived_in_version_id. Documented here as a deliberate
-- scope cut, not an oversight.
--
-- Lock order (fixed, so a future RPC needing both locks doesn't deadlock
-- against this one by acquiring them in the opposite order): import_jobs
-- row first, then the target stories row.

alter table public.import_jobs
  add column if not exists mapping_json jsonb;

alter table public.import_jobs
  add constraint import_jobs_mapping_object
  check (mapping_json is null or jsonb_typeof(mapping_json) = 'object');

create or replace function public.commit_reimport_job(
  p_job_id uuid
)
returns table (story_id uuid, version_id uuid, chapter_id_pairs jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_job public.import_jobs%rowtype;
  v_story public.stories%rowtype;
  v_version_id uuid;
  v_version_number integer;
  v_mapping jsonb;
  v_base_tree_token text;
  v_current_tree_token timestamptz;
  v_section_id uuid;
  v_child_section_id uuid;
  v_chapter_id uuid;
  v_revision_id uuid;
  v_chapter_count integer := 0;
  v_pairs jsonb := '[]'::jsonb;
  v_root record;
  v_child record;
  v_chapter record;
  v_section_match jsonb;
  v_old_section public.sections%rowtype;
  v_decision jsonb;
  v_old_chapter public.chapters%rowtype;
  v_old_content_hash text;
  v_new_content_hash text;
  v_content_changed boolean;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select *
  into v_job
  from public.import_jobs j
  where j.id = p_job_id
    and j.owner_id = v_user_id
  for update;

  if not found then
    raise exception 'import job not found' using errcode = 'P0002';
  end if;

  if v_job.story_id is null then
    raise exception 'this job has no target story; use commit_import_job instead' using errcode = '22023';
  end if;

  if v_job.status = 'completed' then
    select v.id
    into v_version_id
    from public.story_versions v
    where v.import_job_id = v_job.id;

    if v_version_id is null then
      raise exception 'completed re-import is missing its story version';
    end if;

    return query select v_job.story_id, v_version_id, '[]'::jsonb;
    return;
  end if;

  if v_job.status <> 'needs_review' then
    raise exception 'import job is not ready to commit';
  end if;

  select *
  into v_story
  from public.stories s
  where s.id = v_job.story_id
    and s.owner_id = v_user_id
  for update;

  if not found then
    raise exception 'target story not found' using errcode = 'P0002';
  end if;

  if v_story.status <> 'active' then
    raise exception 'target story is not active';
  end if;

  if v_job.draft_json is null
     or jsonb_typeof(v_job.draft_json) <> 'object'
     or jsonb_typeof(v_job.draft_json -> 'sections') <> 'array' then
    raise exception 'invalid import draft';
  end if;

  if v_job.mapping_json is null or jsonb_typeof(v_job.mapping_json) <> 'object' then
    raise exception 'missing chapter mapping';
  end if;
  v_mapping := v_job.mapping_json;

  if jsonb_typeof(v_mapping -> 'decisions') <> 'array' then
    raise exception 'invalid chapter mapping';
  end if;

  v_base_tree_token := v_mapping ->> 'baseTreeToken';
  if v_base_tree_token is null then
    raise exception 'missing base tree token';
  end if;

  select greatest(
    coalesce((select max(c.updated_at) from public.chapters c where c.story_id = v_story.id and c.is_active), 'epoch'::timestamptz),
    coalesce((select max(s.updated_at) from public.sections s where s.story_id = v_story.id and s.is_active), 'epoch'::timestamptz)
  )
  into v_current_tree_token;

  if v_current_tree_token is distinct from v_base_tree_token::timestamptz then
    raise exception 'story changed since this mapping was computed' using errcode = 'KD001';
  end if;

  -- Injectivity: every oldChapterId referenced by a decision must appear in
  -- exactly one decision (never trust that mapping_json already satisfies
  -- this — it's owner-writable via RLS like draft_json is, see 0006).
  if exists (
    select 1
    from (
      select d.value ->> 'oldChapterId' as old_chapter_id
      from jsonb_array_elements(v_mapping -> 'decisions') as d(value)
      where d.value ->> 'oldChapterId' is not null
    ) flattened
    group by old_chapter_id
    having count(*) > 1
  ) then
    raise exception 'a chapter is mapped more than once' using errcode = 'KD002';
  end if;

  -- Coverage: every currently active chapter must have a disposition
  -- (kept, merged-away, or archived) — commit is blocked otherwise, it
  -- never silently defaults to archive (AC-UPD-02).
  if exists (
    select 1
    from public.chapters c
    where c.story_id = v_story.id
      and c.is_active
      and not exists (
        select 1
        from jsonb_array_elements(v_mapping -> 'decisions') as d(value)
        where (d.value ->> 'oldChapterId') = c.id::text
      )
  ) then
    raise exception 'some chapters have no confirmed disposition' using errcode = 'KD003';
  end if;

  select coalesce(max(sv.version_number), 0) + 1
  into v_version_number
  from public.story_versions sv
  where sv.story_id = v_story.id;

  insert into public.story_versions (
    story_id,
    import_job_id,
    version_number,
    source_hash,
    parser_version
  ) values (
    v_story.id,
    v_job.id,
    v_version_number,
    v_job.source_hash,
    v_job.parser_version
  )
  returning id into v_version_id;

  update public.import_jobs
  set status = 'committing', error_message = null
  where id = v_job.id;

  for v_root in
    select value as data, ordinality as position
    from jsonb_array_elements(v_job.draft_json -> 'sections') with ordinality
  loop
    if jsonb_typeof(v_root.data) <> 'object'
       or jsonb_typeof(v_root.data -> 'chapters') <> 'array'
       or jsonb_typeof(v_root.data -> 'children') <> 'array'
       or coalesce(v_root.data ->> 'id', '') = '' then
      raise exception 'invalid root section';
    end if;

    v_section_match := (
      select s.value
      from jsonb_array_elements(coalesce(v_mapping -> 'sections', '[]'::jsonb)) as s(value)
      where s.value ->> 'newSectionId' = v_root.data ->> 'id'
      limit 1
    );
    v_old_section := null;
    if v_section_match is not null then
      select * into v_old_section
      from public.sections s
      where s.id = (v_section_match ->> 'oldSectionId')::uuid
        and s.story_id = v_story.id
        and s.is_active
        and s.parent_section_id is null;
    end if;

    if v_old_section.id is not null then
      v_section_id := v_old_section.id;
      update public.sections
      set type = (v_root.data ->> 'type')::public.section_type,
          title = btrim(v_root.data ->> 'title'),
          sort_order = (v_root.position - 1)::integer
      where id = v_section_id;
    else
      v_section_id := gen_random_uuid();
      insert into public.sections (
        id, story_id, parent_section_id, type, title, source_key, sort_order
      ) values (
        v_section_id, v_story.id, null,
        (v_root.data ->> 'type')::public.section_type,
        btrim(v_root.data ->> 'title'),
        null,
        (v_root.position - 1)::integer
      );
    end if;

    for v_chapter in
      select value as data, ordinality as position
      from jsonb_array_elements(v_root.data -> 'chapters') with ordinality
    loop
      if jsonb_typeof(v_chapter.data) <> 'object'
         or jsonb_typeof(v_chapter.data -> 'blocks') <> 'array'
         or jsonb_array_length(v_chapter.data -> 'blocks') = 0
         or coalesce(v_chapter.data ->> 'contentHash', '') !~ '^[0-9a-f]{64}$'
         or char_length(btrim(coalesce(v_chapter.data ->> 'title', ''))) not between 1 and 200 then
        raise exception 'invalid chapter';
      end if;

      v_decision := (
        select d.value
        from jsonb_array_elements(v_mapping -> 'decisions') as d(value)
        where d.value ->> 'kind' = 'primary'
          and d.value ->> 'newChapterId' = v_chapter.data ->> 'id'
        limit 1
      );

      if v_decision is not null then
        select * into v_old_chapter
        from public.chapters c
        where c.id = (v_decision ->> 'oldChapterId')::uuid
          and c.story_id = v_story.id;
        if not found then
          raise exception 'invalid mapping: unknown old chapter' using errcode = 'KD004';
        end if;

        select cr.content_hash into v_old_content_hash
        from public.chapter_revisions cr
        where cr.id = v_old_chapter.current_revision_id;
        v_new_content_hash := v_chapter.data ->> 'contentHash';
        v_content_changed := v_old_content_hash is distinct from v_new_content_hash;

        v_chapter_id := v_old_chapter.id;
        if v_content_changed then
          v_revision_id := gen_random_uuid();
          insert into public.chapter_revisions (
            id, chapter_id, created_in_version_id, content_blocks, content_hash, word_count
          ) values (
            v_revision_id, v_chapter_id, v_version_id,
            jsonb_build_object('schema_version', 1, 'blocks', v_chapter.data -> 'blocks'),
            v_new_content_hash,
            greatest(0, (v_chapter.data ->> 'wordCount')::integer)
          );
        else
          v_revision_id := v_old_chapter.current_revision_id;
        end if;

        update public.chapters
        set section_id = v_section_id,
            kind = (v_chapter.data ->> 'kind')::public.chapter_kind,
            title = btrim(v_chapter.data ->> 'title'),
            source_key = nullif(v_chapter.data ->> 'sourceKey', ''),
            sort_order = (v_chapter.position - 1)::integer,
            current_revision_id = v_revision_id
        where id = v_chapter_id;

        v_pairs := v_pairs || jsonb_build_array(jsonb_build_object(
          'oldChapterId', v_old_chapter.id,
          'newChapterId', v_chapter.data ->> 'id',
          'oldRevisionId', v_old_chapter.current_revision_id,
          'newRevisionId', v_revision_id,
          'contentChanged', v_content_changed
        ));
      else
        v_chapter_id := gen_random_uuid();
        insert into public.chapters (
          id, story_id, section_id, kind, title, source_key, sort_order
        ) values (
          v_chapter_id, v_story.id, v_section_id,
          (v_chapter.data ->> 'kind')::public.chapter_kind,
          btrim(v_chapter.data ->> 'title'),
          nullif(v_chapter.data ->> 'sourceKey', ''),
          (v_chapter.position - 1)::integer
        );

        v_revision_id := gen_random_uuid();
        insert into public.chapter_revisions (
          id, chapter_id, created_in_version_id, content_blocks, content_hash, word_count
        ) values (
          v_revision_id, v_chapter_id, v_version_id,
          jsonb_build_object('schema_version', 1, 'blocks', v_chapter.data -> 'blocks'),
          v_chapter.data ->> 'contentHash',
          greatest(0, (v_chapter.data ->> 'wordCount')::integer)
        );

        update public.chapters
        set current_revision_id = v_revision_id
        where id = v_chapter_id;
      end if;

      v_chapter_count := v_chapter_count + 1;
    end loop;

    for v_child in
      select value as data, ordinality as position
      from jsonb_array_elements(v_root.data -> 'children') with ordinality
    loop
      if jsonb_typeof(v_child.data) <> 'object'
         or jsonb_typeof(v_child.data -> 'chapters') <> 'array'
         or jsonb_typeof(v_child.data -> 'children') <> 'array'
         or jsonb_array_length(v_child.data -> 'children') <> 0
         or coalesce(v_child.data ->> 'id', '') = '' then
        raise exception 'invalid child section';
      end if;

      v_section_match := (
        select s.value
        from jsonb_array_elements(coalesce(v_mapping -> 'sections', '[]'::jsonb)) as s(value)
        where s.value ->> 'newSectionId' = v_child.data ->> 'id'
        limit 1
      );
      v_old_section := null;
      if v_section_match is not null then
        select * into v_old_section
        from public.sections s
        where s.id = (v_section_match ->> 'oldSectionId')::uuid
          and s.story_id = v_story.id
          and s.is_active
          and s.parent_section_id = v_section_id;
      end if;

      if v_old_section.id is not null then
        v_child_section_id := v_old_section.id;
        update public.sections
        set type = (v_child.data ->> 'type')::public.section_type,
            title = btrim(v_child.data ->> 'title'),
            sort_order = jsonb_array_length(v_root.data -> 'chapters') + (v_child.position - 1)::integer
        where id = v_child_section_id;
      else
        v_child_section_id := gen_random_uuid();
        insert into public.sections (
          id, story_id, parent_section_id, type, title, source_key, sort_order
        ) values (
          v_child_section_id, v_story.id, v_section_id,
          (v_child.data ->> 'type')::public.section_type,
          btrim(v_child.data ->> 'title'),
          null,
          jsonb_array_length(v_root.data -> 'chapters') + (v_child.position - 1)::integer
        );
      end if;

      for v_chapter in
        select value as data, ordinality as position
        from jsonb_array_elements(v_child.data -> 'chapters') with ordinality
      loop
        if jsonb_typeof(v_chapter.data) <> 'object'
           or jsonb_typeof(v_chapter.data -> 'blocks') <> 'array'
           or jsonb_array_length(v_chapter.data -> 'blocks') = 0
           or coalesce(v_chapter.data ->> 'contentHash', '') !~ '^[0-9a-f]{64}$'
           or char_length(btrim(coalesce(v_chapter.data ->> 'title', ''))) not between 1 and 200 then
          raise exception 'invalid chapter';
        end if;

        v_decision := (
          select d.value
          from jsonb_array_elements(v_mapping -> 'decisions') as d(value)
          where d.value ->> 'kind' = 'primary'
            and d.value ->> 'newChapterId' = v_chapter.data ->> 'id'
          limit 1
        );

        if v_decision is not null then
          select * into v_old_chapter
          from public.chapters c
          where c.id = (v_decision ->> 'oldChapterId')::uuid
            and c.story_id = v_story.id;
          if not found then
            raise exception 'invalid mapping: unknown old chapter' using errcode = 'KD004';
          end if;

          select cr.content_hash into v_old_content_hash
          from public.chapter_revisions cr
          where cr.id = v_old_chapter.current_revision_id;
          v_new_content_hash := v_chapter.data ->> 'contentHash';
          v_content_changed := v_old_content_hash is distinct from v_new_content_hash;

          v_chapter_id := v_old_chapter.id;
          if v_content_changed then
            v_revision_id := gen_random_uuid();
            insert into public.chapter_revisions (
              id, chapter_id, created_in_version_id, content_blocks, content_hash, word_count
            ) values (
              v_revision_id, v_chapter_id, v_version_id,
              jsonb_build_object('schema_version', 1, 'blocks', v_chapter.data -> 'blocks'),
              v_new_content_hash,
              greatest(0, (v_chapter.data ->> 'wordCount')::integer)
            );
          else
            v_revision_id := v_old_chapter.current_revision_id;
          end if;

          update public.chapters
          set section_id = v_child_section_id,
              kind = (v_chapter.data ->> 'kind')::public.chapter_kind,
              title = btrim(v_chapter.data ->> 'title'),
              source_key = nullif(v_chapter.data ->> 'sourceKey', ''),
              sort_order = (v_chapter.position - 1)::integer,
              current_revision_id = v_revision_id
          where id = v_chapter_id;

          v_pairs := v_pairs || jsonb_build_array(jsonb_build_object(
            'oldChapterId', v_old_chapter.id,
            'newChapterId', v_chapter.data ->> 'id',
            'oldRevisionId', v_old_chapter.current_revision_id,
            'newRevisionId', v_revision_id,
            'contentChanged', v_content_changed
          ));
        else
          v_chapter_id := gen_random_uuid();
          insert into public.chapters (
            id, story_id, section_id, kind, title, source_key, sort_order
          ) values (
            v_chapter_id, v_story.id, v_child_section_id,
            (v_chapter.data ->> 'kind')::public.chapter_kind,
            btrim(v_chapter.data ->> 'title'),
            nullif(v_chapter.data ->> 'sourceKey', ''),
            (v_chapter.position - 1)::integer
          );

          v_revision_id := gen_random_uuid();
          insert into public.chapter_revisions (
            id, chapter_id, created_in_version_id, content_blocks, content_hash, word_count
          ) values (
            v_revision_id, v_chapter_id, v_version_id,
            jsonb_build_object('schema_version', 1, 'blocks', v_chapter.data -> 'blocks'),
            v_chapter.data ->> 'contentHash',
            greatest(0, (v_chapter.data ->> 'wordCount')::integer)
          );

          update public.chapters
          set current_revision_id = v_revision_id
          where id = v_chapter_id;
        end if;

        v_chapter_count := v_chapter_count + 1;
      end loop;
    end loop;
  end loop;

  if v_chapter_count = 0 then
    raise exception 'import draft has no chapters';
  end if;

  -- Merged/archived old chapters: soft-archive, never hard-delete (§11.11).
  for v_decision in
    select value from jsonb_array_elements(v_mapping -> 'decisions') as d(value)
    where value ->> 'kind' in ('merged', 'archived')
  loop
    if v_decision ->> 'kind' = 'merged' then
      select c.current_revision_id into v_revision_id
      from public.chapters c
      where c.id = (v_decision ->> 'oldChapterId')::uuid and c.story_id = v_story.id;

      v_pairs := v_pairs || jsonb_build_array(jsonb_build_object(
        'oldChapterId', v_decision ->> 'oldChapterId',
        'newChapterId', v_decision ->> 'newChapterId',
        'oldRevisionId', v_revision_id,
        'newRevisionId', null,
        'contentChanged', true,
        'merged', true
      ));
    end if;

    update public.chapters c
    set is_active = false, archived_in_version_id = v_version_id
    where c.id = (v_decision ->> 'oldChapterId')::uuid
      and c.story_id = v_story.id
      and c.is_active;
  end loop;

  -- Sections left with no active chapters anywhere under them are archived
  -- too (soft — sections have no archived_in_version_id column, only
  -- is_active, since only chapters carry per-version history).
  update public.sections s
  set is_active = false
  where s.story_id = v_story.id
    and s.is_active
    and not exists (
      select 1 from public.chapters c where c.section_id = s.id and c.is_active
    )
    and not exists (
      select 1
      from public.sections child
      join public.chapters cc on cc.section_id = child.id and cc.is_active
      where child.parent_section_id = s.id and child.is_active
    );

  update public.import_jobs
  set status = 'completed',
      completed_at = now(),
      error_message = null
  where id = v_job.id;

  return query select v_story.id, v_version_id, v_pairs;
end;
$$;

revoke all on function public.commit_reimport_job(uuid) from public;
revoke all on function public.commit_reimport_job(uuid) from anon;
grant execute on function public.commit_reimport_job(uuid) to authenticated;
