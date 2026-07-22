-- Delete a section without deleting any chapter or nested section.
-- Direct chapters are appended to the parent section. When deleting a root
-- section, they are moved into a root "Chưa phân hồi" section so they remain
-- available in both the Reader and chapter-order manager. Child sections are
-- promoted to the deleted section's parent.

create or replace function public.delete_story_section_preserving_contents(
  p_story_id uuid,
  p_section_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_section public.sections%rowtype;
  v_destination_section_id uuid;
  v_chapter_offset integer;
  v_section_offset integer;
  v_moved_chapter_count integer := 0;
  v_promoted_section_count integer := 0;
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

  select s.*
  into v_section
  from public.sections s
  where s.id = p_section_id
    and s.story_id = p_story_id
    and s.is_active
  for update;

  if not found then
    raise exception 'active section not found' using errcode = 'P0002';
  end if;

  -- Lock the affected hierarchy before calculating append positions.
  perform 1
  from public.sections s
  where s.story_id = p_story_id
  for update;

  perform 1
  from public.chapters c
  where c.story_id = p_story_id
  for update;

  v_destination_section_id := v_section.parent_section_id;

  if v_destination_section_id is null and exists (
    select 1 from public.chapters c where c.section_id = p_section_id
  ) then
    select s.id
    into v_destination_section_id
    from public.sections s
    where s.story_id = p_story_id
      and s.parent_section_id is null
      and s.is_active
      and s.id <> p_section_id
      and lower(btrim(s.title)) = lower('Chưa phân hồi')
    order by s.sort_order, s.created_at, s.id
    limit 1;

    if v_destination_section_id is null then
      insert into public.sections (
        story_id,
        parent_section_id,
        type,
        title,
        sort_order
      ) values (
        p_story_id,
        null,
        'part'::public.section_type,
        'Chưa phân hồi',
        v_section.sort_order
      )
      returning id into v_destination_section_id;
    end if;
  end if;

  select coalesce(max(c.sort_order), -1) + 1
  into v_chapter_offset
  from public.chapters c
  where c.section_id = v_destination_section_id;

  with moved as (
    select
      c.id,
      row_number() over (order by c.sort_order, c.created_at, c.id) - 1 as position
    from public.chapters c
    where c.section_id = p_section_id
  )
  update public.chapters c
  set
    section_id = v_destination_section_id,
    sort_order = v_chapter_offset + moved.position::integer
  from moved
  where c.id = moved.id;

  get diagnostics v_moved_chapter_count = row_count;

  select coalesce(max(s.sort_order), -1) + 1
  into v_section_offset
  from public.sections s
  where s.story_id = p_story_id
    and s.id <> p_section_id
    and s.parent_section_id is not distinct from v_section.parent_section_id;

  with promoted as (
    select
      s.id,
      row_number() over (order by s.sort_order, s.created_at, s.id) - 1 as position
    from public.sections s
    where s.parent_section_id = p_section_id
  )
  update public.sections s
  set
    parent_section_id = v_section.parent_section_id,
    sort_order = v_section_offset + promoted.position::integer
  from promoted
  where s.id = promoted.id;

  get diagnostics v_promoted_section_count = row_count;

  delete from public.sections s
  where s.id = p_section_id
    and s.story_id = p_story_id;

  if not found then
    raise exception 'active section not found' using errcode = 'P0002';
  end if;

  update public.stories
  set updated_at = now()
  where id = p_story_id;

  return jsonb_build_object(
    'movedChapterCount', v_moved_chapter_count,
    'promotedSectionCount', v_promoted_section_count,
    'destinationSectionId', v_destination_section_id
  );
end;
$$;

revoke all on function public.delete_story_section_preserving_contents(uuid, uuid) from public;
revoke all on function public.delete_story_section_preserving_contents(uuid, uuid) from anon;
grant execute on function public.delete_story_section_preserving_contents(uuid, uuid) to authenticated;
