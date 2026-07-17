-- Fix the ownership validation join in reorder_story_chapters.  The
-- submitted JSON is flattened in a CTE first so both section_id and
-- chapter_id are visible to the LEFT JOIN.

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
    with submitted as (
      select
        (section_item.value ->> 'sectionId')::uuid as section_id,
        chapter_id.value::uuid as chapter_id
      from jsonb_array_elements(p_sections) section_item(value),
           jsonb_array_elements_text(section_item.value -> 'chapterIds') chapter_id(value)
    )
    select 1
    from submitted
    left join public.chapters c
      on c.id = submitted.chapter_id
     and c.story_id = p_story_id
     and c.is_active
     and c.section_id = submitted.section_id
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
