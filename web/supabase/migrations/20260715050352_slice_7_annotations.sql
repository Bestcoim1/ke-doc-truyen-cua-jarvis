-- Slice 7: private, owner-scoped chapter annotations.
-- This migration intentionally lives under web/supabase/migrations because
-- web/ is the deployable Supabase project and the working directory used by CI.
-- Its timestamp matches the migration already recorded by the hosted project.

create table if not exists public.chapter_annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  anchor_id text not null check (char_length(anchor_id) between 1 and 100),
  start_offset integer not null,
  end_offset integer not null,
  color text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chapter_annotations_valid_offsets
    check (start_offset >= 0 and end_offset >= start_offset)
);

create index if not exists chapter_annotations_user_chapter_idx
  on public.chapter_annotations (user_id, chapter_id);

create index if not exists chapter_annotations_story_idx
  on public.chapter_annotations (story_id);

create index if not exists chapter_annotations_chapter_anchor_idx
  on public.chapter_annotations (chapter_id, anchor_id);

drop trigger if exists chapter_annotations_set_updated_at
  on public.chapter_annotations;
create trigger chapter_annotations_set_updated_at
  before update on public.chapter_annotations
  for each row execute function public.set_updated_at();

alter table public.chapter_annotations enable row level security;

-- A user-owned annotation must also point to a chapter belonging to the same
-- user-owned story. Foreign keys alone do not enforce tenant ownership.
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

grant select, insert, update, delete
  on table public.chapter_annotations
  to authenticated, service_role;
