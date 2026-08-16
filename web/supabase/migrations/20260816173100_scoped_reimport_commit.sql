-- Commit a precise chapter/section re-import without normalizing or mutating
-- unrelated story structure. Legacy whole-story updates and append jobs keep
-- using commit_reimport_job_v2 unchanged.

create or replace function public.commit_reimport_job_v3(
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
  v_scope_kind text;
  v_scope_target_text text;
  v_scope_target uuid;
  v_scope_section_ids uuid[] := '{}'::uuid[];
  v_allowed_section_ids uuid[] := '{}'::uuid[];
  v_sections_snapshot jsonb := '[]'::jsonb;
  v_target_chapter_section_id uuid;
  v_target_chapter_sort_order integer;
  v_target_section_parent_id uuid;
  v_target_section_sort_order integer;
  v_draft_chapter_count integer;
  v_draft_chapter_id text;
  v_result_story_id uuid;
  v_result_version_id uuid;
  v_result_pairs jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select *
  into v_job
  from public.import_jobs j
  where j.id = p_job_id
    and j.owner_id = v_user_id;

  if not found then
    raise exception 'import job not found' using errcode = 'P0002';
  end if;

  v_scope_kind := v_job.mapping_json -> 'scope' ->> 'kind';
  v_scope_target_text := v_job.mapping_json -> 'scope' ->> 'targetId';

  -- Old jobs, append jobs and explicit whole-story jobs preserve their current
  -- behavior. A completed precise job delegates to the idempotent base RPC and
  -- deliberately skips any further order normalization.
  if v_scope_kind is null
     or v_scope_kind = 'story'
     or coalesce(v_job.mapping_json ->> 'mode', 'update') <> 'update' then
    return query
      select committed.story_id, committed.version_id, committed.chapter_id_pairs
      from public.commit_reimport_job_v2(p_job_id) as committed;
    return;
  elsif v_job.status = 'completed' then
    return query
      select committed.story_id, committed.version_id, committed.chapter_id_pairs
      from public.commit_reimport_job(p_job_id) as committed;
    return;
  end if;

  if v_scope_kind not in ('chapter', 'section')
     or coalesce(v_scope_target_text, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid re-import scope' using errcode = '22023';
  end if;
  v_scope_target := v_scope_target_text::uuid;

  if v_scope_kind = 'chapter' then
    select c.section_id, c.sort_order
    into v_target_chapter_section_id, v_target_chapter_sort_order
    from public.chapters c
    where c.id = v_scope_target
      and c.story_id = v_job.story_id
      and c.is_active;

    if not found or v_target_chapter_section_id is null then
      raise exception 'scoped chapter not found' using errcode = 'P0002';
    end if;

    with recursive ancestors as (
      select s.id, s.parent_section_id
      from public.sections s
      where s.id = v_target_chapter_section_id
        and s.story_id = v_job.story_id
        and s.is_active

      union all

      select parent.id, parent.parent_section_id
      from public.sections parent
      join ancestors child on child.parent_section_id = parent.id
      where parent.story_id = v_job.story_id
        and parent.is_active
    )
    select coalesce(array_agg(id), '{}'::uuid[])
    into v_allowed_section_ids
    from ancestors;

    select coalesce(sum(
      jsonb_array_length(root.value -> 'chapters') +
      coalesce((
        select sum(jsonb_array_length(child.value -> 'chapters'))
        from jsonb_array_elements(root.value -> 'children') as child(value)
      ), 0)
    ), 0)::integer
    into v_draft_chapter_count
    from jsonb_array_elements(v_job.draft_json -> 'sections') as root(value);

    if v_draft_chapter_count <> 1 then
      raise exception 'chapter-scoped re-import must contain exactly one chapter'
        using errcode = '22023';
    end if;

    select candidate.data ->> 'id'
    into v_draft_chapter_id
    from (
      select chapter.value as data
      from jsonb_array_elements(v_job.draft_json -> 'sections') as root(value)
      cross join lateral jsonb_array_elements(root.value -> 'chapters') as chapter(value)

      union all

      select chapter.value as data
      from jsonb_array_elements(v_job.draft_json -> 'sections') as root(value)
      cross join lateral jsonb_array_elements(root.value -> 'children') as child(value)
      cross join lateral jsonb_array_elements(child.value -> 'chapters') as chapter(value)
    ) candidate
    limit 1;

    if not exists (
      select 1
      from jsonb_array_elements(v_job.mapping_json -> 'decisions') as d(value)
      where d.value ->> 'oldChapterId' = v_scope_target::text
        and d.value ->> 'kind' = 'primary'
        and d.value ->> 'newChapterId' = v_draft_chapter_id
    ) then
      raise exception 'scoped chapter must be the primary mapping'
        using errcode = 'KD004';
    end if;

    if exists (
      select 1
      from public.chapters c
      join jsonb_array_elements(v_job.mapping_json -> 'decisions') as d(value)
        on d.value ->> 'oldChapterId' = c.id::text
      where c.story_id = v_job.story_id
        and c.is_active
        and c.id <> v_scope_target
        and d.value ->> 'kind' <> 'unrelated'
    ) then
      raise exception 'chapter scope attempted to change another chapter'
        using errcode = '22023';
    end if;
  else
    with recursive scoped_sections as (
      select s.id
      from public.sections s
      where s.id = v_scope_target
        and s.story_id = v_job.story_id
        and s.is_active

      union all

      select child.id
      from public.sections child
      join scoped_sections parent on child.parent_section_id = parent.id
      where child.story_id = v_job.story_id
        and child.is_active
    )
    select coalesce(array_agg(id), '{}'::uuid[])
    into v_scope_section_ids
    from scoped_sections;

    if coalesce(array_length(v_scope_section_ids, 1), 0) = 0 then
      raise exception 'scoped section not found' using errcode = 'P0002';
    end if;

    select s.parent_section_id, s.sort_order
    into v_target_section_parent_id, v_target_section_sort_order
    from public.sections s
    where s.id = v_scope_target
      and s.story_id = v_job.story_id
      and s.is_active;

    with recursive ancestors as (
      select s.id, s.parent_section_id
      from public.sections s
      where s.id = v_scope_target
        and s.story_id = v_job.story_id
        and s.is_active

      union all

      select parent.id, parent.parent_section_id
      from public.sections parent
      join ancestors child on child.parent_section_id = parent.id
      where parent.story_id = v_job.story_id
        and parent.is_active
    )
    select coalesce(array_agg(distinct id), '{}'::uuid[])
    into v_allowed_section_ids
    from (
      select unnest(v_scope_section_ids) as id
      union all
      select ancestors.id from ancestors
    ) allowed;

    if exists (
      select 1
      from public.chapters c
      join jsonb_array_elements(v_job.mapping_json -> 'decisions') as d(value)
        on d.value ->> 'oldChapterId' = c.id::text
      where c.story_id = v_job.story_id
        and c.is_active
        and (c.section_id is null or not (c.section_id = any(v_scope_section_ids)))
        and d.value ->> 'kind' <> 'unrelated'
    ) then
      raise exception 'section scope attempted to change an outside chapter'
        using errcode = '22023';
    end if;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(
      coalesce(v_job.mapping_json -> 'sections', '[]'::jsonb)
    ) as matched(value)
    where not exists (
      select 1
      from unnest(v_allowed_section_ids) as allowed(id)
      where allowed.id::text = matched.value ->> 'oldSectionId'
    )
  ) then
    raise exception 'section mapping escaped the selected scope'
      using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'parentSectionId', s.parent_section_id,
    'sectionType', s.type,
    'title', s.title,
    'sourceKey', s.source_key,
    'sortOrder', s.sort_order,
    'isActive', s.is_active
  )), '[]'::jsonb)
  into v_sections_snapshot
  from public.sections s
  where s.story_id = v_job.story_id;

  select committed.story_id, committed.version_id, committed.chapter_id_pairs
  into v_result_story_id, v_result_version_id, v_result_pairs
  from public.commit_reimport_job(p_job_id) as committed;

  if v_scope_kind = 'chapter' then
    update public.chapters c
    set section_id = v_target_chapter_section_id,
        sort_order = v_target_chapter_sort_order
    where c.id = v_scope_target
      and c.story_id = v_result_story_id
      and (c.section_id, c.sort_order) is distinct from
          (v_target_chapter_section_id, v_target_chapter_sort_order);

    -- The base RPC updates matched path sections and archives globally empty
    -- sections. For a one-chapter update, restore every pre-existing section
    -- field if it actually changed.
    with snapshot as (
      select *
      from jsonb_to_recordset(v_sections_snapshot) as x(
        id uuid,
        "parentSectionId" uuid,
        "sectionType" text,
        title text,
        "sourceKey" text,
        "sortOrder" integer,
        "isActive" boolean
      )
    )
    update public.sections s
    set parent_section_id = snapshot."parentSectionId",
        type = snapshot."sectionType"::public.section_type,
        title = snapshot.title,
        source_key = snapshot."sourceKey",
        sort_order = snapshot."sortOrder",
        is_active = snapshot."isActive"
    from snapshot
    where s.id = snapshot.id
      and s.story_id = v_result_story_id
      and (
        s.parent_section_id,
        s.type::text,
        s.title,
        s.source_key,
        s.sort_order,
        s.is_active
      ) is distinct from (
        snapshot."parentSectionId",
        snapshot."sectionType",
        snapshot.title,
        snapshot."sourceKey",
        snapshot."sortOrder",
        snapshot."isActive"
      );
  else
    -- Restore any pre-existing section outside the selected subtree. This also
    -- reverses the base RPC's global empty-section cleanup outside the scope.
    with snapshot as (
      select *
      from jsonb_to_recordset(v_sections_snapshot) as x(
        id uuid,
        "parentSectionId" uuid,
        "sectionType" text,
        title text,
        "sourceKey" text,
        "sortOrder" integer,
        "isActive" boolean
      )
    )
    update public.sections s
    set parent_section_id = snapshot."parentSectionId",
        type = snapshot."sectionType"::public.section_type,
        title = snapshot.title,
        source_key = snapshot."sourceKey",
        sort_order = snapshot."sortOrder",
        is_active = snapshot."isActive"
    from snapshot
    where s.id = snapshot.id
      and s.story_id = v_result_story_id
      and not (s.id = any(v_scope_section_ids))
      and (
        s.parent_section_id,
        s.type::text,
        s.title,
        s.source_key,
        s.sort_order,
        s.is_active
      ) is distinct from (
        snapshot."parentSectionId",
        snapshot."sectionType",
        snapshot.title,
        snapshot."sourceKey",
        snapshot."sortOrder",
        snapshot."isActive"
      );

    -- Updating an arc/hồi edits its contents, not its position among siblings.
    update public.sections s
    set parent_section_id = v_target_section_parent_id,
        sort_order = v_target_section_sort_order
    where s.id = v_scope_target
      and s.story_id = v_result_story_id
      and (s.parent_section_id, s.sort_order) is distinct from
          (v_target_section_parent_id, v_target_section_sort_order);

    with recursive current_scoped_sections as (
      select s.id
      from public.sections s
      where s.id = v_scope_target
        and s.story_id = v_result_story_id
        and s.is_active

      union all

      select child.id
      from public.sections child
      join current_scoped_sections parent on child.parent_section_id = parent.id
      where child.story_id = v_result_story_id
        and child.is_active
    )
    select coalesce(array_agg(id), '{}'::uuid[])
    into v_scope_section_ids
    from current_scoped_sections;

    -- Densify order only inside the selected subtree. Unrelated sections and
    -- chapters are never included in these ranking updates.
    with ranked_chapters as (
      select
        c.id,
        row_number() over (
          partition by c.section_id
          order by c.sort_order, c.created_at, c.id
        ) - 1 as next_sort_order
      from public.chapters c
      where c.story_id = v_result_story_id
        and c.is_active
        and c.section_id = any(v_scope_section_ids)
    )
    update public.chapters c
    set sort_order = ranked_chapters.next_sort_order::integer
    from ranked_chapters
    where c.id = ranked_chapters.id
      and c.sort_order is distinct from ranked_chapters.next_sort_order::integer;

    with ranked_children as (
      select
        s.id,
        coalesce((
          select count(*)
          from public.chapters c
          where c.section_id = s.parent_section_id and c.is_active
        ), 0) + row_number() over (
          partition by s.parent_section_id
          order by s.sort_order, s.created_at, s.id
        ) - 1 as next_sort_order
      from public.sections s
      where s.story_id = v_result_story_id
        and s.is_active
        and s.parent_section_id = any(v_scope_section_ids)
    )
    update public.sections s
    set sort_order = ranked_children.next_sort_order::integer
    from ranked_children
    where s.id = ranked_children.id
      and s.sort_order is distinct from ranked_children.next_sort_order::integer;
  end if;

  return query
    select v_result_story_id, v_result_version_id, coalesce(v_result_pairs, '[]'::jsonb);
end;
$$;

revoke all on function public.commit_reimport_job_v3(uuid) from public;
revoke all on function public.commit_reimport_job_v3(uuid) from anon;
grant execute on function public.commit_reimport_job_v3(uuid) to authenticated;
