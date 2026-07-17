-- Keep partial/append re-imports deterministic and expose an atomic chapter
-- ordering RPC.  commit_reimport_job_v2 deliberately wraps the existing,
-- heavily validated re-import RPC instead of duplicating its mutation logic.

create or replace function public.normalize_reimport_story_order(
  p_story_id uuid,
  p_version_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.stories s
    where s.id = p_story_id and s.owner_id = v_user_id
  ) then
    raise exception 'story not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.story_versions sv
    where sv.id = p_version_id and sv.story_id = p_story_id
  ) then
    raise exception 'story version not found' using errcode = 'P0002';
  end if;

  -- Chapters that were first created by this re-import are the appended
  -- batch.  Existing chapters (including updated primary matches) stay
  -- ahead of that batch; both groups retain their current internal order.
  with ranked as (
    select
      c.id,
      row_number() over (
        partition by c.section_id
        order by
          case when exists (
            select 1
            from public.chapter_revisions current_version_revision
            where current_version_revision.chapter_id = c.id
              and current_version_revision.created_in_version_id = p_version_id
              and not exists (
                select 1
                from public.chapter_revisions older_revision
                where older_revision.chapter_id = c.id
                  and older_revision.created_in_version_id <> p_version_id
              )
          ) then 1 else 0 end,
          c.sort_order,
          c.created_at,
          c.id
      ) - 1 as normalized_sort_order
    from public.chapters c
    where c.story_id = p_story_id and c.is_active
  )
  update public.chapters c
  set sort_order = ranked.normalized_sort_order::integer
  from ranked
  where c.id = ranked.id
    and c.sort_order is distinct from ranked.normalized_sort_order::integer;

  -- Reader nodes share a sequence inside a section.  Keep chapters first,
  -- then child sections in their existing order, with no duplicate values.
  with ranked_children as (
    select
      s.id,
      coalesce((
        select count(*)
        from public.chapters c
        where c.section_id = s.parent_section_id and c.is_active
      ), 0) + row_number() over (
        partition by s.parent_section_id
        order by s.created_at, s.sort_order, s.id
      ) - 1 as normalized_sort_order
    from public.sections s
    where s.story_id = p_story_id
      and s.is_active
      and s.parent_section_id is not null
  )
  update public.sections s
  set sort_order = ranked_children.normalized_sort_order::integer
  from ranked_children
  where s.id = ranked_children.id
    and s.sort_order is distinct from ranked_children.normalized_sort_order::integer;

  -- New top-level sections are appended after older sections.  created_at
  -- provides the import-batch boundary while sort_order preserves order
  -- inside each batch.
  with ranked_roots as (
    select
      s.id,
      row_number() over (
        order by s.created_at, s.sort_order, s.id
      ) - 1 as normalized_sort_order
    from public.sections s
    where s.story_id = p_story_id
      and s.is_active
      and s.parent_section_id is null
  )
  update public.sections s
  set sort_order = ranked_roots.normalized_sort_order::integer
  from ranked_roots
  where s.id = ranked_roots.id
    and s.sort_order is distinct from ranked_roots.normalized_sort_order::integer;
end;
$$;

revoke all on function public.normalize_reimport_story_order(uuid, uuid) from public;
revoke all on function public.normalize_reimport_story_order(uuid, uuid) from anon;
grant execute on function public.normalize_reimport_story_order(uuid, uuid) to authenticated;

create or replace function public.commit_reimport_job_v2(
  p_job_id uuid
)
returns table (story_id uuid, version_id uuid, chapter_id_pairs jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_story_id uuid;
  v_version_id uuid;
  v_pairs jsonb;
begin
  select committed.story_id, committed.version_id, committed.chapter_id_pairs
  into v_story_id, v_version_id, v_pairs
  from public.commit_reimport_job(p_job_id) as committed;

  if v_story_id is null or v_version_id is null then
    raise exception 're-import did not return a committed version';
  end if;

  perform public.normalize_reimport_story_order(v_story_id, v_version_id);

  return query select v_story_id, v_version_id, coalesce(v_pairs, '[]'::jsonb);
end;
$$;

revoke all on function public.commit_reimport_job_v2(uuid) from public;
revoke all on function public.commit_reimport_job_v2(uuid) from anon;
grant execute on function public.commit_reimport_job_v2(uuid) to authenticated;

create or replace function public.reorder_story_chapters(
  p_story_id uuid,
  p_sections jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_active_count integer;
  v_submitted_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  perform 1
  from public.stories s
  where s.id = p_story_id
    and s.owner_id = v_user_id
    and s.status = 'active'
  for update;

  if not found then
    raise exception 'active story not found' using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_sections) <> 'array' then
    raise exception 'chapter order must be an array' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_sections) section_item(value)
    where jsonb_typeof(section_item.value) <> 'object'
      or coalesce(section_item.value ->> 'sectionId', '') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      or jsonb_typeof(section_item.value -> 'chapterIds') <> 'array'
  ) then
    raise exception 'invalid section order entry' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_sections) section_item(value),
         jsonb_array_elements_text(section_item.value -> 'chapterIds') chapter_id(value)
    where chapter_id.value !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  ) then
    raise exception 'invalid chapter id' using errcode = '22023';
  end if;

  select count(*) into v_active_count
  from public.chapters c
  where c.story_id = p_story_id and c.is_active;

  select count(*) into v_submitted_count
  from jsonb_array_elements(p_sections) section_item(value),
       jsonb_array_elements_text(section_item.value -> 'chapterIds') chapter_id(value);

  if v_submitted_count <> v_active_count then
    raise exception 'chapter order must contain every active chapter exactly once'
      using errcode = 'KD006';
  end if;

  if exists (
    select chapter_id.value
    from jsonb_array_elements(p_sections) section_item(value),
         jsonb_array_elements_text(section_item.value -> 'chapterIds') chapter_id(value)
    group by chapter_id.value
    having count(*) <> 1
  ) then
    raise exception 'duplicate chapter in submitted order' using errcode = 'KD006';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_sections) section_item(value),
         jsonb_array_elements_text(section_item.value -> 'chapterIds') chapter_id(value)
    left join public.chapters c
      on c.id = chapter_id.value::uuid
     and c.story_id = p_story_id
     and c.is_active
     and c.section_id = (section_item.value ->> 'sectionId')::uuid
    where c.id is null
  ) then
    raise exception 'chapter does not belong to the submitted section'
      using errcode = 'KD006';
  end if;

  with submitted as (
    select
      chapter_id.value::uuid as chapter_id,
      chapter_id.ordinality - 1 as next_sort_order
    from jsonb_array_elements(p_sections) section_item(value),
         jsonb_array_elements_text(section_item.value -> 'chapterIds')
           with ordinality as chapter_id(value, ordinality)
  )
  update public.chapters c
  set sort_order = submitted.next_sort_order::integer
  from submitted
  where c.id = submitted.chapter_id
    and c.story_id = p_story_id
    and c.sort_order is distinct from submitted.next_sort_order::integer;

  -- Chapters occupy the first positions within their section; preserve the
  -- relative order of child sections immediately after them.
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
    where s.story_id = p_story_id
      and s.is_active
      and s.parent_section_id is not null
  )
  update public.sections s
  set sort_order = ranked_children.next_sort_order::integer
  from ranked_children
  where s.id = ranked_children.id
    and s.sort_order is distinct from ranked_children.next_sort_order::integer;

  update public.stories
  set updated_at = now()
  where id = p_story_id;

  return v_submitted_count;
end;
$$;

revoke all on function public.reorder_story_chapters(uuid, jsonb) from public;
revoke all on function public.reorder_story_chapters(uuid, jsonb) from anon;
grant execute on function public.reorder_story_chapters(uuid, jsonb) to authenticated;
