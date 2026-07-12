-- Slice 2 commit: atomically materialize one reviewed import draft.
-- The RPC is idempotent for an already-completed job and leaves no partial
-- Story/Section/Chapter rows when any validation or insert fails.

create or replace function public.commit_import_job(
  p_job_id uuid,
  p_draft_json jsonb
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

  if p_draft_json is null
     or jsonb_typeof(p_draft_json) <> 'object'
     or jsonb_typeof(p_draft_json -> 'sections') <> 'array' then
    raise exception 'invalid import draft';
  end if;

  v_title := btrim(coalesce(p_draft_json ->> 'title', ''));
  v_description := nullif(btrim(coalesce(p_draft_json ->> 'description', '')), '');
  if char_length(v_title) < 1 or char_length(v_title) > 200 then
    raise exception 'invalid story title';
  end if;
  if v_description is not null and char_length(v_description) > 5000 then
    raise exception 'story description is too long';
  end if;

  update public.import_jobs
  set status = 'committing',
      draft_json = p_draft_json,
      warnings = coalesce(p_draft_json -> 'warnings', '[]'::jsonb),
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
    from jsonb_array_elements(p_draft_json -> 'sections') with ordinality
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

revoke all on function public.commit_import_job(uuid, jsonb) from public;
revoke all on function public.commit_import_job(uuid, jsonb) from anon;
grant execute on function public.commit_import_job(uuid, jsonb) to authenticated;
