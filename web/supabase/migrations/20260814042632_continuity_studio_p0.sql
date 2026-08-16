-- Continuity Studio P0: an author-reviewed story bible, evidence ledger,
-- plot-thread tracker, and deterministic pre-writing brief source.
-- Nothing in this schema promotes extracted material to canon automatically.

do $$ begin
  create type public.continuity_entity_kind as enum (
    'character',
    'location',
    'item',
    'organization',
    'world_rule'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.continuity_fact_status as enum (
    'canon',
    'candidate',
    'inference',
    'disputed',
    'retconned',
    'inactive'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.continuity_evidence_kind as enum (
    'direct_source',
    'author_document',
    'summary_derived',
    'inference',
    'suggestion'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.continuity_thread_type as enum (
    'foreshadowing',
    'mystery',
    'promise',
    'setup_payoff',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.continuity_thread_status as enum (
    'open',
    'progressing',
    'apparently_dropped',
    'resolved',
    'intentionally_unresolved',
    'unknown'
  );
exception when duplicate_object then null;
end $$;

-- Composite source pointers ensure an evidence row cannot silently point to
-- a chapter from a different story. The leftmost `id` remains covered by the
-- chapter primary key; this unique index exists for composite FK integrity.
create unique index if not exists chapters_id_story_uidx
  on public.chapters (id, story_id);

create table public.continuity_entities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  story_id uuid not null,
  kind public.continuity_entity_kind not null,
  name text not null,
  aliases text[] not null default '{}'::text[],
  description text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint continuity_entities_story_owner_fk
    foreign key (story_id, owner_id)
    references public.stories (id, owner_id)
    on delete cascade,
  constraint continuity_entities_id_story_owner_key
    unique (id, story_id, owner_id),
  constraint continuity_entities_name_length
    check (char_length(btrim(name)) between 1 and 160),
  constraint continuity_entities_description_length
    check (description is null or char_length(description) <= 4000),
  constraint continuity_entities_alias_count
    check (cardinality(aliases) <= 30)
);

create index continuity_entities_owner_story_kind_name_idx
  on public.continuity_entities (owner_id, story_id, kind, name)
  where archived_at is null;

create table public.continuity_facts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  story_id uuid not null,
  entity_id uuid,
  statement text not null,
  status public.continuity_fact_status not null default 'candidate',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint continuity_facts_story_owner_fk
    foreign key (story_id, owner_id)
    references public.stories (id, owner_id)
    on delete cascade,
  constraint continuity_facts_entity_same_story_fk
    foreign key (entity_id, story_id, owner_id)
    references public.continuity_entities (id, story_id, owner_id)
    on delete set null (entity_id),
  constraint continuity_facts_id_story_owner_key
    unique (id, story_id, owner_id),
  constraint continuity_facts_statement_length
    check (char_length(btrim(statement)) between 1 and 4000)
);

create index continuity_facts_owner_story_status_updated_idx
  on public.continuity_facts (owner_id, story_id, status, updated_at desc, id);

create index continuity_facts_entity_idx
  on public.continuity_facts (entity_id)
  where entity_id is not null;

create table public.continuity_plot_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  story_id uuid not null,
  thread_type public.continuity_thread_type not null,
  title text not null,
  setup text,
  promise text,
  expected_payoff text,
  notes text,
  status public.continuity_thread_status not null default 'open',
  last_touched_chapter_id uuid,
  due_chapter_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint continuity_plot_threads_story_owner_fk
    foreign key (story_id, owner_id)
    references public.stories (id, owner_id)
    on delete cascade,
  constraint continuity_plot_threads_last_chapter_fk
    foreign key (last_touched_chapter_id, story_id)
    references public.chapters (id, story_id)
    on delete set null (last_touched_chapter_id),
  constraint continuity_plot_threads_due_chapter_fk
    foreign key (due_chapter_id, story_id)
    references public.chapters (id, story_id)
    on delete set null (due_chapter_id),
  constraint continuity_plot_threads_id_story_owner_key
    unique (id, story_id, owner_id),
  constraint continuity_plot_threads_title_length
    check (char_length(btrim(title)) between 1 and 240),
  constraint continuity_plot_threads_text_lengths
    check (
      (setup is null or char_length(setup) <= 4000)
      and (promise is null or char_length(promise) <= 4000)
      and (expected_payoff is null or char_length(expected_payoff) <= 4000)
      and (notes is null or char_length(notes) <= 8000)
    )
);

create index continuity_plot_threads_owner_story_status_updated_idx
  on public.continuity_plot_threads (
    owner_id,
    story_id,
    status,
    updated_at desc,
    id
  );

create index continuity_plot_threads_last_chapter_idx
  on public.continuity_plot_threads (last_touched_chapter_id)
  where last_touched_chapter_id is not null;

create index continuity_plot_threads_due_chapter_idx
  on public.continuity_plot_threads (due_chapter_id)
  where due_chapter_id is not null;

create table public.continuity_evidence (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  story_id uuid not null,
  fact_id uuid,
  plot_thread_id uuid,
  chapter_id uuid,
  source_kind public.continuity_evidence_kind not null,
  source_label text,
  start_line integer,
  end_line integer,
  excerpt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint continuity_evidence_story_owner_fk
    foreign key (story_id, owner_id)
    references public.stories (id, owner_id)
    on delete cascade,
  constraint continuity_evidence_fact_same_story_fk
    foreign key (fact_id, story_id, owner_id)
    references public.continuity_facts (id, story_id, owner_id)
    on delete cascade,
  constraint continuity_evidence_thread_same_story_fk
    foreign key (plot_thread_id, story_id, owner_id)
    references public.continuity_plot_threads (id, story_id, owner_id)
    on delete cascade,
  constraint continuity_evidence_chapter_same_story_fk
    foreign key (chapter_id, story_id)
    references public.chapters (id, story_id)
    on delete set null (chapter_id),
  constraint continuity_evidence_one_parent
    check ((fact_id is not null)::integer + (plot_thread_id is not null)::integer = 1),
  constraint continuity_evidence_has_source
    check (chapter_id is not null or nullif(btrim(source_label), '') is not null),
  constraint continuity_evidence_source_label_length
    check (source_label is null or char_length(source_label) <= 500),
  constraint continuity_evidence_excerpt_length
    check (excerpt is null or char_length(excerpt) <= 4000),
  constraint continuity_evidence_line_range
    check (
      (start_line is null and end_line is null)
      or (
        start_line is not null
        and end_line is not null
        and start_line > 0
        and end_line >= start_line
      )
    )
);

create index continuity_evidence_owner_story_created_idx
  on public.continuity_evidence (owner_id, story_id, created_at desc, id);

create index continuity_evidence_fact_idx
  on public.continuity_evidence (fact_id)
  where fact_id is not null;

create index continuity_evidence_thread_idx
  on public.continuity_evidence (plot_thread_id)
  where plot_thread_id is not null;

create index continuity_evidence_chapter_idx
  on public.continuity_evidence (chapter_id)
  where chapter_id is not null;

create trigger continuity_entities_set_updated_at
  before update on public.continuity_entities
  for each row execute function public.set_updated_at();

create trigger continuity_facts_set_updated_at
  before update on public.continuity_facts
  for each row execute function public.set_updated_at();

create trigger continuity_plot_threads_set_updated_at
  before update on public.continuity_plot_threads
  for each row execute function public.set_updated_at();

create trigger continuity_evidence_set_updated_at
  before update on public.continuity_evidence
  for each row execute function public.set_updated_at();

alter table public.continuity_entities enable row level security;
alter table public.continuity_facts enable row level security;
alter table public.continuity_plot_threads enable row level security;
alter table public.continuity_evidence enable row level security;

create policy continuity_entities_select_own
  on public.continuity_entities for select to authenticated
  using (owner_id = (select auth.uid()));
create policy continuity_entities_insert_own
  on public.continuity_entities for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy continuity_entities_update_own
  on public.continuity_entities for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy continuity_entities_delete_own
  on public.continuity_entities for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy continuity_facts_select_own
  on public.continuity_facts for select to authenticated
  using (owner_id = (select auth.uid()));
create policy continuity_facts_insert_own
  on public.continuity_facts for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy continuity_facts_update_own
  on public.continuity_facts for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy continuity_facts_delete_own
  on public.continuity_facts for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy continuity_plot_threads_select_own
  on public.continuity_plot_threads for select to authenticated
  using (owner_id = (select auth.uid()));
create policy continuity_plot_threads_insert_own
  on public.continuity_plot_threads for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy continuity_plot_threads_update_own
  on public.continuity_plot_threads for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy continuity_plot_threads_delete_own
  on public.continuity_plot_threads for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy continuity_evidence_select_own
  on public.continuity_evidence for select to authenticated
  using (owner_id = (select auth.uid()));
create policy continuity_evidence_insert_own
  on public.continuity_evidence for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy continuity_evidence_update_own
  on public.continuity_evidence for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy continuity_evidence_delete_own
  on public.continuity_evidence for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke all privileges on table
  public.continuity_entities,
  public.continuity_facts,
  public.continuity_plot_threads,
  public.continuity_evidence
from anon;

grant select, insert, update, delete on table
  public.continuity_entities,
  public.continuity_facts,
  public.continuity_plot_threads,
  public.continuity_evidence
to authenticated, service_role;

comment on table public.continuity_entities is
  'Author-managed stable entities for the Continuity Studio story bible.';
comment on table public.continuity_facts is
  'Continuity claims with explicit author-reviewed provenance status.';
comment on table public.continuity_plot_threads is
  'Foreshadowing, mysteries, promises, and setup/payoff tracking.';
comment on table public.continuity_evidence is
  'Source pointers for continuity facts and plot threads; never implicit canon.';
