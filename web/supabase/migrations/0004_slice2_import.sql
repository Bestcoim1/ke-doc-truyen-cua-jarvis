-- Slice 2: import drafts, immutable story-version provenance, and the
-- version links used by a later atomic commit RPC.

do $$ begin
  create type public.import_job_status as enum (
    'uploaded',
    'parsing',
    'needs_review',
    'committing',
    'completed',
    'failed',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.import_source_type as enum ('paste', 'txt', 'docx');
exception when duplicate_object then null;
end $$;

-- Composite tenant FKs below use (id, owner_id) so integrity is enforced
-- for service-role writes as well as through RLS.
create unique index if not exists stories_id_owner_idx
  on public.stories (id, owner_id);

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  story_id uuid,
  source_type public.import_source_type not null,
  source_filename text,
  source_hash text,
  parser_version text not null,
  status public.import_job_status not null default 'uploaded',
  draft_json jsonb,
  warnings jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint import_jobs_story_owner_fk
    foreign key (story_id, owner_id)
    references public.stories (id, owner_id)
    on delete set null (story_id),
  constraint import_jobs_id_story_key unique (id, story_id),
  constraint import_jobs_parser_version_not_blank
    check (btrim(parser_version) <> ''),
  constraint import_jobs_warnings_array
    check (jsonb_typeof(warnings) = 'array'),
  constraint import_jobs_draft_object
    check (draft_json is null or jsonb_typeof(draft_json) = 'object'),
  constraint import_jobs_needs_review_has_draft
    check (status <> 'needs_review' or draft_json is not null)
);

create index if not exists import_jobs_owner_status_created_idx
  on public.import_jobs (owner_id, status, created_at desc);

drop trigger if exists import_jobs_set_updated_at on public.import_jobs;
create trigger import_jobs_set_updated_at
  before update on public.import_jobs
  for each row
  execute function public.set_updated_at();

create table if not exists public.story_versions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  import_job_id uuid not null,
  version_number integer not null,
  source_hash text,
  parser_version text not null,
  committed_at timestamptz not null default now(),
  constraint story_versions_import_job_story_fk
    foreign key (import_job_id, story_id)
    references public.import_jobs (id, story_id)
    deferrable initially deferred,
  constraint story_versions_story_version_key
    unique (story_id, version_number),
  constraint story_versions_import_job_key unique (import_job_id),
  constraint story_versions_id_story_key unique (id, story_id),
  constraint story_versions_version_positive check (version_number > 0),
  constraint story_versions_parser_version_not_blank
    check (btrim(parser_version) <> '')
);

-- The unique constraint above supports reverse scans too; this explicit
-- descending index keeps the requested access path self-documenting.
create index if not exists story_versions_story_version_desc_idx
  on public.story_versions (story_id, version_number desc);

alter table public.chapter_revisions
  add column if not exists created_in_version_id uuid;

alter table public.chapters
  add column if not exists source_key text,
  add column if not exists archived_in_version_id uuid;

alter table public.sections
  add column if not exists source_key text;

do $$ begin
  alter table public.chapter_revisions
    add constraint chapter_revisions_created_in_version_fk
    foreign key (created_in_version_id)
    references public.story_versions (id)
    on delete set null;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.chapters
    add constraint chapters_archived_version_story_fk
    foreign key (archived_in_version_id, story_id)
    references public.story_versions (id, story_id)
    on delete set null (archived_in_version_id);
exception when duplicate_object then null;
end $$;

create index if not exists chapters_story_source_key_idx
  on public.chapters (story_id, source_key);

create index if not exists sections_story_source_key_idx
  on public.sections (story_id, source_key);

-- Story-version identity cannot move after revisions begin referencing it.
-- Metadata may still be corrected by an owner, but provenance keys are fixed.
create or replace function public.preserve_story_version_identity()
returns trigger
language plpgsql
as $$
begin
  if new.story_id is distinct from old.story_id
     or new.import_job_id is distinct from old.import_job_id
     or new.version_number is distinct from old.version_number then
    raise exception 'story version identity is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists story_versions_preserve_identity on public.story_versions;
create trigger story_versions_preserve_identity
  before update on public.story_versions
  for each row
  execute function public.preserve_story_version_identity();

-- Revisions do not duplicate story_id, so this trigger closes the one
-- tenant-integrity relation that cannot be expressed as a composite FK.
create or replace function public.validate_chapter_revision_version()
returns trigger
language plpgsql
as $$
begin
  if new.created_in_version_id is not null and not exists (
    select 1
    from public.chapters c
    join public.story_versions v on v.story_id = c.story_id
    where c.id = new.chapter_id
      and v.id = new.created_in_version_id
  ) then
    raise exception 'created_in_version_id belongs to a different story';
  end if;
  return new;
end;
$$;

drop trigger if exists chapter_revisions_validate_version
  on public.chapter_revisions;
create trigger chapter_revisions_validate_version
  before insert or update on public.chapter_revisions
  for each row
  execute function public.validate_chapter_revision_version();

-- Moving a chapter must not invalidate provenance on any existing revision.
create or replace function public.validate_chapter_version_refs()
returns trigger
language plpgsql
as $$
begin
  if new.archived_in_version_id is not null and not exists (
    select 1
    from public.story_versions v
    where v.id = new.archived_in_version_id
      and v.story_id = new.story_id
  ) then
    raise exception 'archived_in_version_id belongs to a different story';
  end if;

  if exists (
    select 1
    from public.chapter_revisions r
    join public.story_versions v on v.id = r.created_in_version_id
    where r.chapter_id = new.id
      and v.story_id <> new.story_id
  ) then
    raise exception 'chapter revisions belong to a different story version';
  end if;
  return new;
end;
$$;

drop trigger if exists chapters_validate_version_refs on public.chapters;
create trigger chapters_validate_version_refs
  before insert or update on public.chapters
  for each row
  execute function public.validate_chapter_version_refs();

-- RLS ----------------------------------------------------------------------

alter table public.import_jobs enable row level security;
alter table public.story_versions enable row level security;

drop policy if exists import_jobs_select_own on public.import_jobs;
create policy import_jobs_select_own on public.import_jobs
  for select using (auth.uid() = owner_id);

drop policy if exists import_jobs_insert_own on public.import_jobs;
create policy import_jobs_insert_own on public.import_jobs
  for insert with check (
    auth.uid() = owner_id
    and (
      story_id is null
      or exists (
        select 1
        from public.stories s
        where s.id = import_jobs.story_id
          and s.owner_id = auth.uid()
      )
    )
  );

drop policy if exists import_jobs_update_own on public.import_jobs;
create policy import_jobs_update_own on public.import_jobs
  for update using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and (
      story_id is null
      or exists (
        select 1
        from public.stories s
        where s.id = import_jobs.story_id
          and s.owner_id = auth.uid()
      )
    )
  );

drop policy if exists import_jobs_delete_own on public.import_jobs;
create policy import_jobs_delete_own on public.import_jobs
  for delete using (auth.uid() = owner_id);

drop policy if exists story_versions_select_own on public.story_versions;
create policy story_versions_select_own on public.story_versions
  for select using (
    exists (
      select 1
      from public.stories s
      where s.id = story_versions.story_id
        and s.owner_id = auth.uid()
    )
  );

drop policy if exists story_versions_insert_own on public.story_versions;
create policy story_versions_insert_own on public.story_versions
  for insert with check (
    exists (
      select 1
      from public.stories s
      join public.import_jobs j
        on j.id = story_versions.import_job_id
       and j.story_id = story_versions.story_id
      where s.id = story_versions.story_id
        and s.owner_id = auth.uid()
        and j.owner_id = auth.uid()
    )
  );

drop policy if exists story_versions_update_own on public.story_versions;
create policy story_versions_update_own on public.story_versions
  for update using (
    exists (
      select 1
      from public.stories s
      where s.id = story_versions.story_id
        and s.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1
      from public.stories s
      join public.import_jobs j
        on j.id = story_versions.import_job_id
       and j.story_id = story_versions.story_id
      where s.id = story_versions.story_id
        and s.owner_id = auth.uid()
        and j.owner_id = auth.uid()
    )
  );

drop policy if exists story_versions_delete_own on public.story_versions;
create policy story_versions_delete_own on public.story_versions
  for delete using (
    exists (
      select 1
      from public.stories s
      where s.id = story_versions.story_id
        and s.owner_id = auth.uid()
    )
  );

-- story_visibility remains the Slice 0 enum with only the 'private' value;
-- this migration deliberately does not widen it.
