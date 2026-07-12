-- Slice 2 follow-up: tighten the commit_import_job contract.
--
-- Before this migration, commit_import_job(p_job_id, p_draft_json) let any
-- caller holding a valid session commit an arbitrary draft blob for a job
-- they own, independent of whatever was actually persisted on that job's
-- draft_json column (e.g. a stale hidden-form resubmission, or a draft that
-- never went through review's "save"). The RPC only validated draft shape
-- (chapter counts, contentHash format via regex) — it trusted the caller for
-- content itself.
--
-- This migration makes the job's own persisted draft_json the single source
-- of truth for what gets committed: the RPC now takes only p_job_id, reads
-- draft_json from the locked import_jobs row, and commits that. The server
-- action (lib/import/actions.ts) is changed to persist the freshly
-- normalized draft (content_blocks/content_hash recomputed server-side from
-- contentText, never trusted from the client — see
-- normalizeImportDraft/buildDraftChapterContent) via the same owner- and
-- status-scoped UPDATE the "save" action already uses, immediately before
-- calling this RPC.
--
-- Residual limitation, accepted for this pass: RLS still lets an owner PATCH
-- import_jobs.draft_json directly (needed for the review "save" flow), so a
-- caller bypassing the Next.js app entirely could still hand-craft a draft
-- with a contentHash that doesn't actually match its blocks — the RPC checks
-- hash *format* (64 hex chars), not correspondence to content, because
-- reproducing anchors.ts's hashContentBlocks() normalization byte-for-byte
-- in SQL (Unicode NFC + whitespace collapse) risks silently diverging from
-- the JS implementation and rejecting legitimate imports. Since stories are
-- private and owner-scoped, the blast radius of that gap is limited to a
-- user corrupting their own story's internal consistency (e.g. content_hash
-- assumptions FR-10/FR-07 rely on for completion-tracking and re-import
-- diffing). Tracked as a follow-up, not solved here.
--
-- Retry semantics (FR-09: "Commit retry phải idempotent, không tạo
-- version/chapter trùng"): unchanged and now unambiguous by construction —
-- since the RPC no longer takes a draft parameter, a retry always means
-- "commit whatever is on this job", so returning the existing story/version
-- for an already-completed job is the only sensible reading of "idempotent".

drop function if exists public.commit_import_job(uuid, jsonb);

-- chapters.current_revision_id previously only had to reference *some* row
-- in chapter_revisions, not one that actually belongs to the chapter it's
-- set on. Nothing in today's code sets it incorrectly, but the constraint
-- should say so instead of relying on that being true forever.
alter table public.chapter_revisions
  add constraint chapter_revisions_id_chapter_key unique (id, chapter_id);

alter table public.chapters
  drop constraint if exists chapters_current_revision_fk;
alter table public.chapters
  add constraint chapters_current_revision_fk
  foreign key (current_revision_id, id)
  references public.chapter_revisions (id, chapter_id)
  on delete set null (current_revision_id);

create or replace function public.commit_import_job(
  p_job_id uuid
)
returns table (story_id uuid, version_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_job public.import_jobs%rowtype;
  v_story_id uuid;
  v_version_id uuid;
  v_section_id uuid;
  v_child_section_id uuid;
  v_chapter_id uuid;
  v_revision_id uuid;
  v_chapter_count integer := 0;
  v_root record;
  v_child record;
  v_chapter record;
  v_title text;
  v_description text;
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

  if v_job.status = 'completed' then
    select v.id
    into v_version_id
    from public.story_versions v
    where v.import_job_id = v_job.id;

    if v_job.story_id is null or v_version_id is null then
      raise exception 'completed import is missing its story version';
    end if;

    return query select v_job.story_id, v_version_id;
    return;
  end if;

  if v_job.status <> 'needs_review' then
    raise exception 'import job is not ready to commit';
  end if;

  if v_job.draft_json is null
     or jsonb_typeof(v_job.draft_json) <> 'object'
     or jsonb_typeof(v_job.draft_json -> 'sections') <> 'array' then
    raise exception 'invalid import draft';
  end if;

  v_title := btrim(coalesce(v_job.draft_json ->> 'title', ''));
  v_description := nullif(btrim(coalesce(v_job.draft_json ->> 'description', '')), '');
  if char_length(v_title) < 1 or char_length(v_title) > 200 then
    raise exception 'invalid story title';
  end if;
  if v_description is not null and char_length(v_description) > 5000 then
    raise exception 'story description is too long';
  end if;

  update public.import_jobs
  set status = 'committing',
      warnings = coalesce(v_job.draft_json -> 'warnings', '[]'::jsonb),
      error_message = null
  where id = v_job.id;

  insert into public.stories (owner_id, title, description, visibility, status)
  values (v_user_id, v_title, v_description, 'private', 'active')
  returning id into v_story_id;

  update public.import_jobs
  set story_id = v_story_id
  where id = v_job.id;

  insert into public.story_versions (
    story_id,
    import_job_id,
    version_number,
    source_hash,
    parser_version
  ) values (
    v_story_id,
    v_job.id,
    1,
    v_job.source_hash,
    v_job.parser_version
  )
  returning id into v_version_id;

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

    v_section_id := gen_random_uuid();
    insert into public.sections (
      id,
      story_id,
      parent_section_id,
      type,
      title,
      source_key,
      sort_order
    ) values (
      v_section_id,
      v_story_id,
      null,
      (v_root.data ->> 'type')::public.section_type,
      btrim(v_root.data ->> 'title'),
      null,
      (v_root.position - 1)::integer
    );

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

      v_chapter_id := gen_random_uuid();
      insert into public.chapters (
        id,
        story_id,
        section_id,
        kind,
        title,
        source_key,
        sort_order
      ) values (
        v_chapter_id,
        v_story_id,
        v_section_id,
        (v_chapter.data ->> 'kind')::public.chapter_kind,
        btrim(v_chapter.data ->> 'title'),
        nullif(v_chapter.data ->> 'sourceKey', ''),
        (v_chapter.position - 1)::integer
      );

      v_revision_id := gen_random_uuid();
      insert into public.chapter_revisions (
        id,
        chapter_id,
        created_in_version_id,
        content_blocks,
        content_hash,
        word_count
      ) values (
        v_revision_id,
        v_chapter_id,
        v_version_id,
        jsonb_build_object('schema_version', 1, 'blocks', v_chapter.data -> 'blocks'),
        v_chapter.data ->> 'contentHash',
        greatest(0, (v_chapter.data ->> 'wordCount')::integer)
      );

      update public.chapters
      set current_revision_id = v_revision_id
      where id = v_chapter_id;
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

      v_child_section_id := gen_random_uuid();
      insert into public.sections (
        id,
        story_id,
        parent_section_id,
        type,
        title,
        source_key,
        sort_order
      ) values (
        v_child_section_id,
        v_story_id,
        v_section_id,
        (v_child.data ->> 'type')::public.section_type,
        btrim(v_child.data ->> 'title'),
        null,
        jsonb_array_length(v_root.data -> 'chapters')
          + (v_child.position - 1)::integer
      );

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

        v_chapter_id := gen_random_uuid();
        insert into public.chapters (
          id,
          story_id,
          section_id,
          kind,
          title,
          source_key,
          sort_order
        ) values (
          v_chapter_id,
          v_story_id,
          v_child_section_id,
          (v_chapter.data ->> 'kind')::public.chapter_kind,
          btrim(v_chapter.data ->> 'title'),
          nullif(v_chapter.data ->> 'sourceKey', ''),
          (v_chapter.position - 1)::integer
        );

        v_revision_id := gen_random_uuid();
        insert into public.chapter_revisions (
          id,
          chapter_id,
          created_in_version_id,
          content_blocks,
          content_hash,
          word_count
        ) values (
          v_revision_id,
          v_chapter_id,
          v_version_id,
          jsonb_build_object('schema_version', 1, 'blocks', v_chapter.data -> 'blocks'),
          v_chapter.data ->> 'contentHash',
          greatest(0, (v_chapter.data ->> 'wordCount')::integer)
        );

        update public.chapters
        set current_revision_id = v_revision_id
        where id = v_chapter_id;
        v_chapter_count := v_chapter_count + 1;
      end loop;
    end loop;
  end loop;

  if v_chapter_count = 0 then
    raise exception 'import draft has no chapters';
  end if;

  update public.import_jobs
  set status = 'completed',
      completed_at = now(),
      error_message = null
  where id = v_job.id;

  return query select v_story_id, v_version_id;
end;
$$;

revoke all on function public.commit_import_job(uuid) from public;
revoke all on function public.commit_import_job(uuid) from anon;
grant execute on function public.commit_import_job(uuid) to authenticated;
