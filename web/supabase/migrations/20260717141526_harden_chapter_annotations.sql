-- Bring the hosted Slice 7 schema in line with the owner-scoped local schema.
-- The timestamp matches the migration version recorded by the hosted project.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chapter_annotations_anchor_id_length'
      and conrelid = 'public.chapter_annotations'::regclass
  ) then
    alter table public.chapter_annotations
      add constraint chapter_annotations_anchor_id_length
      check (char_length(anchor_id) between 1 and 100);
  end if;
end
$$;

create index if not exists chapter_annotations_user_chapter_idx
  on public.chapter_annotations (user_id, chapter_id);

create index if not exists chapter_annotations_chapter_anchor_idx
  on public.chapter_annotations (chapter_id, anchor_id);

drop trigger if exists handle_updated_at on public.chapter_annotations;
drop trigger if exists chapter_annotations_set_updated_at on public.chapter_annotations;
create trigger chapter_annotations_set_updated_at
  before update on public.chapter_annotations
  for each row execute function public.set_updated_at();

alter table public.chapter_annotations enable row level security;

drop policy if exists "Users can read their own annotations"
  on public.chapter_annotations;
drop policy if exists "Users can insert their own annotations"
  on public.chapter_annotations;
drop policy if exists "Users can update their own annotations"
  on public.chapter_annotations;
drop policy if exists "Users can delete their own annotations"
  on public.chapter_annotations;

drop policy if exists chapter_annotations_select_own
  on public.chapter_annotations;
create policy chapter_annotations_select_own
  on public.chapter_annotations
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.chapters c
      join public.stories s on s.id = c.story_id
      where c.id = chapter_annotations.chapter_id
        and c.story_id = chapter_annotations.story_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists chapter_annotations_insert_own
  on public.chapter_annotations;
create policy chapter_annotations_insert_own
  on public.chapter_annotations
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.chapters c
      join public.stories s on s.id = c.story_id
      where c.id = chapter_annotations.chapter_id
        and c.story_id = chapter_annotations.story_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists chapter_annotations_update_own
  on public.chapter_annotations;
create policy chapter_annotations_update_own
  on public.chapter_annotations
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.chapters c
      join public.stories s on s.id = c.story_id
      where c.id = chapter_annotations.chapter_id
        and c.story_id = chapter_annotations.story_id
        and s.owner_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.chapters c
      join public.stories s on s.id = c.story_id
      where c.id = chapter_annotations.chapter_id
        and c.story_id = chapter_annotations.story_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists chapter_annotations_delete_own
  on public.chapter_annotations;
create policy chapter_annotations_delete_own
  on public.chapter_annotations
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.chapters c
      join public.stories s on s.id = c.story_id
      where c.id = chapter_annotations.chapter_id
        and c.story_id = chapter_annotations.story_id
        and s.owner_id = (select auth.uid())
    )
  );

revoke all privileges on table public.chapter_annotations from anon;
revoke all privileges on table public.chapter_annotations from authenticated;
revoke all privileges on table public.chapter_annotations from service_role;

grant select, insert, update, delete
  on table public.chapter_annotations
  to authenticated, service_role;
