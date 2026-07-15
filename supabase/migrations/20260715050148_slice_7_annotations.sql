create table public.chapter_annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  anchor_id text not null,
  start_offset integer not null,
  end_offset integer not null,
  color text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- ensure start <= end and valid length
  constraint valid_offsets check (start_offset <= end_offset and start_offset >= 0)
);

-- Indexes for efficient querying by user, story, chapter, and anchor
create index chapter_annotations_user_id_idx on public.chapter_annotations(user_id);
create index chapter_annotations_story_id_idx on public.chapter_annotations(story_id);
create index chapter_annotations_chapter_id_idx on public.chapter_annotations(chapter_id);
create index chapter_annotations_anchor_id_idx on public.chapter_annotations(anchor_id);

-- RLS
alter table public.chapter_annotations enable row level security;

create policy "Users can read their own annotations"
  on public.chapter_annotations
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own annotations"
  on public.chapter_annotations
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own annotations"
  on public.chapter_annotations
  for update
  using (auth.uid() = user_id);

create policy "Users can delete their own annotations"
  on public.chapter_annotations
  for delete
  using (auth.uid() = user_id);

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to update updated_at
create trigger handle_updated_at before update on public.chapter_annotations
  for each row execute procedure public.update_updated_at_column();
