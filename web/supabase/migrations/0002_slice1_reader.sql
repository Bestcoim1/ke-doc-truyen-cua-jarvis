-- Slice 1: Reader domain — sections/chapters/revisions, progress, read
-- state, reading settings, RLS, and the two conditional-upsert RPCs FR-10
-- requires. See ke-doc-mvp-spec-v0.2.md sections 7.2, 10.2, 11.5-11.10.

do $$ begin
  create type section_type as enum ('volume', 'arc', 'part');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type chapter_kind as enum ('regular', 'extra');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type reading_theme as enum ('light', 'dark', 'sepia');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type completion_method as enum ('reader_end', 'next_action', 'revision_migration');
exception when duplicate_object then null;
end $$;

-- sections -------------------------------------------------------------

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  parent_section_id uuid references public.sections (id) on delete cascade,
  type section_type not null,
  title text not null check (char_length(title) between 1 and 200),
  sort_order integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sections_story_parent_sort_idx
  on public.sections (story_id, parent_section_id, sort_order);

create or replace function public.validate_section_depth()
returns trigger
language plpgsql
as $$
declare
  parent_has_parent boolean;
begin
  if new.parent_section_id is not null then
    select (parent_section_id is not null) into parent_has_parent
    from public.sections
    where id = new.parent_section_id;

    if parent_has_parent is null then
      raise exception 'parent_section_id does not exist';
    end if;

    if parent_has_parent then
      raise exception 'sections may not exceed 2 levels';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sections_validate_depth on public.sections;
create trigger sections_validate_depth
  before insert or update on public.sections
  for each row
  execute function public.validate_section_depth();

drop trigger if exists sections_set_updated_at on public.sections;
create trigger sections_set_updated_at
  before update on public.sections
  for each row
  execute function public.set_updated_at();

-- chapters ---------------------------------------------------------------

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  section_id uuid references public.sections (id) on delete set null,
  kind chapter_kind not null default 'regular',
  title text not null check (char_length(title) between 1 and 200),
  is_synthetic boolean not null default false,
  sort_order integer not null,
  current_revision_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chapters_story_section_sort_idx
  on public.chapters (story_id, section_id, sort_order);

create index if not exists chapters_story_active_sort_idx
  on public.chapters (story_id, is_active, sort_order);

drop trigger if exists chapters_set_updated_at on public.chapters;
create trigger chapters_set_updated_at
  before update on public.chapters
  for each row
  execute function public.set_updated_at();

-- chapter_revisions --------------------------------------------------------
-- created_in_version_id is added later (Slice 2) once story_versions exists.

create table if not exists public.chapter_revisions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  content_blocks jsonb not null,
  content_hash text not null,
  word_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists chapter_revisions_chapter_created_idx
  on public.chapter_revisions (chapter_id, created_at desc);

alter table public.chapters
  drop constraint if exists chapters_current_revision_fk;
alter table public.chapters
  add constraint chapters_current_revision_fk
  foreign key (current_revision_id) references public.chapter_revisions (id)
  on delete set null;

-- reading_progress -----------------------------------------------------

create table if not exists public.reading_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  chapter_revision_id uuid not null references public.chapter_revisions (id),
  paragraph_anchor_id text not null,
  paragraph_fingerprint text not null,
  paragraph_ordinal integer not null default 0,
  paragraph_offset_ratio numeric,
  chapter_progress_pct numeric not null default 0,
  last_write_id uuid,
  observed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, story_id)
);

create index if not exists reading_progress_user_updated_idx
  on public.reading_progress (user_id, updated_at desc);

-- chapter_read_states ----------------------------------------------------

create table if not exists public.chapter_read_states (
  user_id uuid not null references auth.users (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  last_revision_id uuid references public.chapter_revisions (id),
  last_content_hash text,
  last_anchor_id text,
  max_progress_pct numeric not null default 0,
  first_opened_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  completed_content_hash text,
  completed_at timestamptz,
  completion_method completion_method,
  updated_at timestamptz not null default now(),
  primary key (user_id, story_id, chapter_id)
);

create index if not exists chapter_read_states_user_story_updated_idx
  on public.chapter_read_states (user_id, story_id, updated_at desc);

-- reading_settings ---------------------------------------------------------

create table if not exists public.reading_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  font_size_step smallint not null default 1,
  line_height numeric not null default 1.7,
  theme reading_theme not null default 'light',
  updated_at timestamptz not null default now()
);

drop trigger if exists reading_settings_set_updated_at on public.reading_settings;
create trigger reading_settings_set_updated_at
  before update on public.reading_settings
  for each row
  execute function public.set_updated_at();

-- RLS ----------------------------------------------------------------------

alter table public.sections enable row level security;
alter table public.chapters enable row level security;
alter table public.chapter_revisions enable row level security;
alter table public.reading_progress enable row level security;
alter table public.chapter_read_states enable row level security;
alter table public.reading_settings enable row level security;

drop policy if exists sections_owner_all on public.sections;
create policy sections_owner_all on public.sections
  for all using (
    exists (select 1 from public.stories s where s.id = sections.story_id and s.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.stories s where s.id = sections.story_id and s.owner_id = auth.uid())
  );

drop policy if exists chapters_owner_all on public.chapters;
create policy chapters_owner_all on public.chapters
  for all using (
    exists (select 1 from public.stories s where s.id = chapters.story_id and s.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.stories s where s.id = chapters.story_id and s.owner_id = auth.uid())
  );

drop policy if exists chapter_revisions_owner_all on public.chapter_revisions;
create policy chapter_revisions_owner_all on public.chapter_revisions
  for all using (
    exists (
      select 1 from public.chapters c
      join public.stories s on s.id = c.story_id
      where c.id = chapter_revisions.chapter_id and s.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.chapters c
      join public.stories s on s.id = c.story_id
      where c.id = chapter_revisions.chapter_id and s.owner_id = auth.uid()
    )
  );

drop policy if exists reading_progress_owner_all on public.reading_progress;
create policy reading_progress_owner_all on public.reading_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists chapter_read_states_owner_all on public.chapter_read_states;
create policy chapter_read_states_owner_all on public.chapter_read_states
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists reading_settings_owner_all on public.reading_settings;
create policy reading_settings_owner_all on public.reading_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- RPCs -----------------------------------------------------------------

-- Conditional upsert: a write with an older observed_at (a late/duplicate
-- delivery from another device) can never regress the resume anchor.
create or replace function public.upsert_reading_progress(
  p_story_id uuid,
  p_chapter_id uuid,
  p_chapter_revision_id uuid,
  p_paragraph_anchor_id text,
  p_paragraph_fingerprint text,
  p_paragraph_ordinal integer,
  p_paragraph_offset_ratio numeric,
  p_chapter_progress_pct numeric,
  p_write_id uuid,
  p_observed_at timestamptz
)
returns void
language plpgsql
security invoker
as $$
begin
  insert into public.reading_progress (
    user_id, story_id, chapter_id, chapter_revision_id,
    paragraph_anchor_id, paragraph_fingerprint, paragraph_ordinal,
    paragraph_offset_ratio, chapter_progress_pct, last_write_id,
    observed_at, updated_at
  ) values (
    auth.uid(), p_story_id, p_chapter_id, p_chapter_revision_id,
    p_paragraph_anchor_id, p_paragraph_fingerprint, p_paragraph_ordinal,
    p_paragraph_offset_ratio, p_chapter_progress_pct, p_write_id,
    p_observed_at, now()
  )
  on conflict (user_id, story_id) do update set
    chapter_id = excluded.chapter_id,
    chapter_revision_id = excluded.chapter_revision_id,
    paragraph_anchor_id = excluded.paragraph_anchor_id,
    paragraph_fingerprint = excluded.paragraph_fingerprint,
    paragraph_ordinal = excluded.paragraph_ordinal,
    paragraph_offset_ratio = excluded.paragraph_offset_ratio,
    chapter_progress_pct = excluded.chapter_progress_pct,
    last_write_id = excluded.last_write_id,
    observed_at = excluded.observed_at,
    updated_at = now()
  where excluded.observed_at > public.reading_progress.observed_at
     or (excluded.observed_at = public.reading_progress.observed_at
         and excluded.last_write_id = public.reading_progress.last_write_id);
end;
$$;

-- Conditional upsert: max_progress_pct never decreases; completed_content_hash
-- only advances to the caller's content hash (never cleared by an older call).
create or replace function public.upsert_chapter_progress(
  p_story_id uuid,
  p_chapter_id uuid,
  p_revision_id uuid,
  p_content_hash text,
  p_anchor_id text,
  p_progress_pct numeric,
  p_mark_completed boolean,
  p_completion_method completion_method
)
returns void
language plpgsql
security invoker
as $$
begin
  insert into public.chapter_read_states (
    user_id, story_id, chapter_id, last_revision_id, last_content_hash,
    last_anchor_id, max_progress_pct, first_opened_at, last_opened_at,
    completed_content_hash, completed_at, completion_method, updated_at
  ) values (
    auth.uid(), p_story_id, p_chapter_id, p_revision_id, p_content_hash,
    p_anchor_id, p_progress_pct, now(), now(),
    case when p_mark_completed then p_content_hash else null end,
    case when p_mark_completed then now() else null end,
    case when p_mark_completed then p_completion_method else null end,
    now()
  )
  on conflict (user_id, story_id, chapter_id) do update set
    last_revision_id = excluded.last_revision_id,
    last_content_hash = excluded.last_content_hash,
    last_anchor_id = excluded.last_anchor_id,
    max_progress_pct = greatest(public.chapter_read_states.max_progress_pct, excluded.max_progress_pct),
    last_opened_at = now(),
    completed_content_hash = case
      when p_mark_completed then p_content_hash
      else public.chapter_read_states.completed_content_hash
    end,
    completed_at = case
      when p_mark_completed and public.chapter_read_states.completed_content_hash is distinct from p_content_hash
        then now()
      else public.chapter_read_states.completed_at
    end,
    completion_method = case
      when p_mark_completed then p_completion_method
      else public.chapter_read_states.completion_method
    end,
    updated_at = now();
end;
$$;
