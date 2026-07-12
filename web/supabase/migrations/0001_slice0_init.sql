-- Slice 0 walking skeleton: stories table, RLS, private storage bucket.
-- See ke-doc-mvp-spec-v0.2.md sections 11.2, 11.11, 12.3.

create extension if not exists pgcrypto;

do $$ begin
  create type story_visibility as enum ('private');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type story_status as enum ('active', 'archived', 'deleting');
exception when duplicate_object then null;
end $$;

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  visibility story_visibility not null default 'private',
  status story_status not null default 'active',
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stories_owner_status_last_read_idx
  on public.stories (owner_id, status, last_read_at desc);

create index if not exists stories_owner_updated_idx
  on public.stories (owner_id, updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stories_set_updated_at on public.stories;
create trigger stories_set_updated_at
  before update on public.stories
  for each row
  execute function public.set_updated_at();

alter table public.stories enable row level security;

drop policy if exists stories_select_own on public.stories;
create policy stories_select_own on public.stories
  for select using (auth.uid() = owner_id);

drop policy if exists stories_insert_own on public.stories;
create policy stories_insert_own on public.stories
  for insert with check (auth.uid() = owner_id);

drop policy if exists stories_update_own on public.stories;
create policy stories_update_own on public.stories
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists stories_delete_own on public.stories;
create policy stories_delete_own on public.stories
  for delete using (auth.uid() = owner_id);

-- Private storage bucket for import source files (consumed starting Slice 2).
-- Object path convention: {owner_id}/{...}. Ownership is enforced by matching
-- the first path segment against auth.uid(), not by bucket-level ACLs alone.
insert into storage.buckets (id, name, public)
values ('story-sources', 'story-sources', false)
on conflict (id) do nothing;

drop policy if exists story_sources_select_own on storage.objects;
create policy story_sources_select_own on storage.objects
  for select using (
    bucket_id = 'story-sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists story_sources_insert_own on storage.objects;
create policy story_sources_insert_own on storage.objects
  for insert with check (
    bucket_id = 'story-sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists story_sources_update_own on storage.objects;
create policy story_sources_update_own on storage.objects
  for update using (
    bucket_id = 'story-sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists story_sources_delete_own on storage.objects;
create policy story_sources_delete_own on storage.objects
  for delete using (
    bucket_id = 'story-sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
