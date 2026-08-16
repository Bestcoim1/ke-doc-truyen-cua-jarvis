-- Continuity Studio P1: deterministic candidate extraction, structured
-- timeline/knowledge records, evidence-backed alerts, and an author-owned
-- review inbox. Analysis output is never canon until the author accepts it.

do $$ begin
  create type public.continuity_analysis_run_status as enum (
    'running',
    'completed',
    'failed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.continuity_inbox_kind as enum (
    'state_change',
    'location_change',
    'knowledge_claim',
    'possession_change',
    'timeline_event',
    'alert'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.continuity_alert_kind as enum (
    'state_conflict',
    'impossible_travel',
    'premature_knowledge',
    'duplicate_item',
    'forgotten_thread'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.continuity_review_status as enum (
    'pending',
    'accepted',
    'dismissed',
    'intentional',
    'retcon'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.continuity_severity as enum (
    'minor',
    'moderate',
    'major',
    'canon_breaking'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.continuity_knowledge_state as enum (
    'knows',
    'does_not_know',
    'believes_false',
    'doubts'
  );
exception when duplicate_object then null;
end $$;

create table public.continuity_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  story_id uuid not null,
  version_id uuid not null,
  import_job_id uuid,
  status public.continuity_analysis_run_status not null default 'running',
  detector_version text not null,
  chapters_analyzed integer not null default 0,
  candidate_count integer not null default 0,
  alert_count integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint continuity_analysis_runs_story_owner_fk
    foreign key (story_id, owner_id)
    references public.stories (id, owner_id)
    on delete cascade,
  constraint continuity_analysis_runs_version_story_fk
    foreign key (version_id, story_id)
    references public.story_versions (id, story_id)
    on delete cascade,
  constraint continuity_analysis_runs_job_story_fk
    foreign key (import_job_id, story_id)
    references public.import_jobs (id, story_id)
    on delete set null (import_job_id),
  constraint continuity_analysis_runs_story_version_key
    unique (story_id, version_id, detector_version),
  constraint continuity_analysis_runs_id_story_owner_key
    unique (id, story_id, owner_id),
  constraint continuity_analysis_runs_counts_nonnegative
    check (
      chapters_analyzed >= 0
      and candidate_count >= 0
      and alert_count >= 0
    ),
  constraint continuity_analysis_runs_detector_version_length
    check (char_length(btrim(detector_version)) between 1 and 80),
  constraint continuity_analysis_runs_error_length
    check (error_message is null or char_length(error_message) <= 1000)
);

create index continuity_analysis_runs_owner_story_started_idx
  on public.continuity_analysis_runs (owner_id, story_id, started_at desc, id);

create table public.continuity_inbox_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  story_id uuid not null,
  run_id uuid not null,
  kind public.continuity_inbox_kind not null,
  alert_kind public.continuity_alert_kind,
  severity public.continuity_severity,
  subject_entity_id uuid,
  related_entity_id uuid,
  statement text not null,
  metadata jsonb not null default '{}'::jsonb,
  review_status public.continuity_review_status not null default 'pending',
  fingerprint text not null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint continuity_inbox_items_story_owner_fk
    foreign key (story_id, owner_id)
    references public.stories (id, owner_id)
    on delete cascade,
  constraint continuity_inbox_items_run_same_story_fk
    foreign key (run_id, story_id, owner_id)
    references public.continuity_analysis_runs (id, story_id, owner_id)
    on delete cascade,
  constraint continuity_inbox_items_subject_same_story_fk
    foreign key (subject_entity_id, story_id, owner_id)
    references public.continuity_entities (id, story_id, owner_id)
    on delete set null (subject_entity_id),
  constraint continuity_inbox_items_related_same_story_fk
    foreign key (related_entity_id, story_id, owner_id)
    references public.continuity_entities (id, story_id, owner_id)
    on delete set null (related_entity_id),
  constraint continuity_inbox_items_id_story_owner_key
    unique (id, story_id, owner_id),
  constraint continuity_inbox_items_run_fingerprint_key
    unique (run_id, fingerprint),
  constraint continuity_inbox_items_statement_length
    check (char_length(btrim(statement)) between 1 and 4000),
  constraint continuity_inbox_items_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint continuity_inbox_items_fingerprint_shape
    check (fingerprint ~ '^[0-9a-f]{64}$'),
  constraint continuity_inbox_items_alert_shape
    check (
      (
        kind = 'alert'
        and alert_kind is not null
        and severity is not null
      )
      or (
        kind <> 'alert'
        and alert_kind is null
        and severity is null
      )
    )
);

create index continuity_inbox_items_owner_story_review_created_idx
  on public.continuity_inbox_items (
    owner_id,
    story_id,
    review_status,
    created_at desc,
    id
  );

create index continuity_inbox_items_run_idx
  on public.continuity_inbox_items (run_id);

create index continuity_inbox_items_subject_idx
  on public.continuity_inbox_items (subject_entity_id)
  where subject_entity_id is not null;

create index continuity_inbox_items_related_idx
  on public.continuity_inbox_items (related_entity_id)
  where related_entity_id is not null;

create table public.continuity_inbox_evidence (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  story_id uuid not null,
  inbox_item_id uuid not null,
  chapter_id uuid,
  chapter_revision_id uuid,
  source_label text not null,
  source_anchor_id text,
  start_line integer,
  end_line integer,
  excerpt text,
  created_at timestamptz not null default now(),
  constraint continuity_inbox_evidence_story_owner_fk
    foreign key (story_id, owner_id)
    references public.stories (id, owner_id)
    on delete cascade,
  constraint continuity_inbox_evidence_item_same_story_fk
    foreign key (inbox_item_id, story_id, owner_id)
    references public.continuity_inbox_items (id, story_id, owner_id)
    on delete cascade,
  constraint continuity_inbox_evidence_chapter_same_story_fk
    foreign key (chapter_id, story_id)
    references public.chapters (id, story_id)
    on delete set null (chapter_id),
  constraint continuity_inbox_evidence_revision_chapter_fk
    foreign key (chapter_revision_id, chapter_id)
    references public.chapter_revisions (id, chapter_id)
    on delete set null (chapter_revision_id),
  constraint continuity_inbox_evidence_source_label_length
    check (char_length(btrim(source_label)) between 1 and 500),
  constraint continuity_inbox_evidence_anchor_length
    check (source_anchor_id is null or char_length(source_anchor_id) <= 200),
  constraint continuity_inbox_evidence_excerpt_length
    check (excerpt is null or char_length(excerpt) <= 4000),
  constraint continuity_inbox_evidence_line_range
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

create index continuity_inbox_evidence_item_idx
  on public.continuity_inbox_evidence (inbox_item_id);

create index continuity_inbox_evidence_chapter_idx
  on public.continuity_inbox_evidence (chapter_id)
  where chapter_id is not null;

create index continuity_inbox_evidence_revision_idx
  on public.continuity_inbox_evidence (chapter_revision_id)
  where chapter_revision_id is not null;

create table public.continuity_timeline_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  story_id uuid not null,
  participant_entity_id uuid,
  location_entity_id uuid,
  title text not null,
  time_start text,
  time_end text,
  chapter_sequence integer,
  certainty public.continuity_fact_status not null,
  source_inbox_item_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint continuity_timeline_events_story_owner_fk
    foreign key (story_id, owner_id)
    references public.stories (id, owner_id)
    on delete cascade,
  constraint continuity_timeline_events_participant_fk
    foreign key (participant_entity_id, story_id, owner_id)
    references public.continuity_entities (id, story_id, owner_id)
    on delete set null (participant_entity_id),
  constraint continuity_timeline_events_location_fk
    foreign key (location_entity_id, story_id, owner_id)
    references public.continuity_entities (id, story_id, owner_id)
    on delete set null (location_entity_id),
  constraint continuity_timeline_events_source_item_fk
    foreign key (source_inbox_item_id, story_id, owner_id)
    references public.continuity_inbox_items (id, story_id, owner_id),
  constraint continuity_timeline_events_source_item_key
    unique (source_inbox_item_id),
  constraint continuity_timeline_events_title_length
    check (char_length(btrim(title)) between 1 and 4000),
  constraint continuity_timeline_events_time_length
    check (
      (time_start is null or char_length(time_start) <= 500)
      and (time_end is null or char_length(time_end) <= 500)
    ),
  constraint continuity_timeline_events_sequence_nonnegative
    check (chapter_sequence is null or chapter_sequence >= 0),
  constraint continuity_timeline_events_certainty_check
    check (certainty in ('canon', 'inference', 'disputed'))
);

create index continuity_timeline_events_owner_story_sequence_idx
  on public.continuity_timeline_events (
    owner_id,
    story_id,
    chapter_sequence,
    id
  );

create index continuity_timeline_events_participant_idx
  on public.continuity_timeline_events (participant_entity_id)
  where participant_entity_id is not null;

create index continuity_timeline_events_location_idx
  on public.continuity_timeline_events (location_entity_id)
  where location_entity_id is not null;

create table public.continuity_character_knowledge (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  story_id uuid not null,
  character_entity_id uuid not null,
  fact_id uuid,
  knowledge_text text not null,
  knowledge_state public.continuity_knowledge_state not null,
  is_secret boolean not null default true,
  certainty public.continuity_fact_status not null,
  acquired_chapter_id uuid,
  chapter_sequence integer,
  source_inbox_item_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint continuity_character_knowledge_story_owner_fk
    foreign key (story_id, owner_id)
    references public.stories (id, owner_id)
    on delete cascade,
  constraint continuity_character_knowledge_character_fk
    foreign key (character_entity_id, story_id, owner_id)
    references public.continuity_entities (id, story_id, owner_id),
  constraint continuity_character_knowledge_fact_fk
    foreign key (fact_id, story_id, owner_id)
    references public.continuity_facts (id, story_id, owner_id)
    on delete set null (fact_id),
  constraint continuity_character_knowledge_chapter_fk
    foreign key (acquired_chapter_id, story_id)
    references public.chapters (id, story_id)
    on delete set null (acquired_chapter_id),
  constraint continuity_character_knowledge_source_item_fk
    foreign key (source_inbox_item_id, story_id, owner_id)
    references public.continuity_inbox_items (id, story_id, owner_id),
  constraint continuity_character_knowledge_source_item_key
    unique (source_inbox_item_id),
  constraint continuity_character_knowledge_text_length
    check (char_length(btrim(knowledge_text)) between 1 and 4000),
  constraint continuity_character_knowledge_sequence_nonnegative
    check (chapter_sequence is null or chapter_sequence >= 0),
  constraint continuity_character_knowledge_certainty_check
    check (certainty in ('canon', 'inference', 'disputed'))
);

create index continuity_character_knowledge_owner_story_character_idx
  on public.continuity_character_knowledge (
    owner_id,
    story_id,
    character_entity_id,
    chapter_sequence,
    id
  );

create index continuity_character_knowledge_fact_idx
  on public.continuity_character_knowledge (fact_id)
  where fact_id is not null;

alter table public.continuity_facts
  add column source_inbox_item_id uuid;

alter table public.continuity_facts
  add constraint continuity_facts_source_inbox_item_fk
  foreign key (source_inbox_item_id, story_id, owner_id)
  references public.continuity_inbox_items (id, story_id, owner_id);

alter table public.continuity_facts
  add constraint continuity_facts_source_inbox_item_key
  unique (source_inbox_item_id);

alter table public.continuity_evidence
  add column chapter_revision_id uuid,
  add column source_anchor_id text;

alter table public.continuity_evidence
  add constraint continuity_evidence_revision_chapter_fk
  foreign key (chapter_revision_id, chapter_id)
  references public.chapter_revisions (id, chapter_id)
  on delete set null (chapter_revision_id);

alter table public.continuity_evidence
  add constraint continuity_evidence_anchor_length
  check (source_anchor_id is null or char_length(source_anchor_id) <= 200);

create index continuity_facts_source_inbox_item_idx
  on public.continuity_facts (source_inbox_item_id)
  where source_inbox_item_id is not null;

create index continuity_evidence_revision_idx
  on public.continuity_evidence (chapter_revision_id)
  where chapter_revision_id is not null;

create trigger continuity_analysis_runs_set_updated_at
  before update on public.continuity_analysis_runs
  for each row execute function public.set_updated_at();

create trigger continuity_inbox_items_set_updated_at
  before update on public.continuity_inbox_items
  for each row execute function public.set_updated_at();

create trigger continuity_timeline_events_set_updated_at
  before update on public.continuity_timeline_events
  for each row execute function public.set_updated_at();

create trigger continuity_character_knowledge_set_updated_at
  before update on public.continuity_character_knowledge
  for each row execute function public.set_updated_at();

alter table public.continuity_analysis_runs enable row level security;
alter table public.continuity_inbox_items enable row level security;
alter table public.continuity_inbox_evidence enable row level security;
alter table public.continuity_timeline_events enable row level security;
alter table public.continuity_character_knowledge enable row level security;

create policy continuity_analysis_runs_select_own
  on public.continuity_analysis_runs for select to authenticated
  using (owner_id = (select auth.uid()));
create policy continuity_analysis_runs_insert_own
  on public.continuity_analysis_runs for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy continuity_analysis_runs_update_own
  on public.continuity_analysis_runs for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy continuity_analysis_runs_delete_own
  on public.continuity_analysis_runs for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy continuity_inbox_items_select_own
  on public.continuity_inbox_items for select to authenticated
  using (owner_id = (select auth.uid()));
create policy continuity_inbox_items_insert_own
  on public.continuity_inbox_items for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy continuity_inbox_items_update_own
  on public.continuity_inbox_items for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy continuity_inbox_items_delete_own
  on public.continuity_inbox_items for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy continuity_inbox_evidence_select_own
  on public.continuity_inbox_evidence for select to authenticated
  using (owner_id = (select auth.uid()));
create policy continuity_inbox_evidence_insert_own
  on public.continuity_inbox_evidence for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy continuity_inbox_evidence_delete_own
  on public.continuity_inbox_evidence for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy continuity_timeline_events_select_own
  on public.continuity_timeline_events for select to authenticated
  using (owner_id = (select auth.uid()));
create policy continuity_timeline_events_insert_own
  on public.continuity_timeline_events for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy continuity_timeline_events_update_own
  on public.continuity_timeline_events for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy continuity_timeline_events_delete_own
  on public.continuity_timeline_events for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy continuity_character_knowledge_select_own
  on public.continuity_character_knowledge for select to authenticated
  using (owner_id = (select auth.uid()));
create policy continuity_character_knowledge_insert_own
  on public.continuity_character_knowledge for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy continuity_character_knowledge_update_own
  on public.continuity_character_knowledge for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy continuity_character_knowledge_delete_own
  on public.continuity_character_knowledge for delete to authenticated
  using (owner_id = (select auth.uid()));

create or replace function public.review_continuity_inbox_item(
  p_item_id uuid,
  p_decision public.continuity_review_status,
  p_record_status public.continuity_fact_status default null,
  p_knowledge_state public.continuity_knowledge_state default null
)
returns table (
  out_review_status public.continuity_review_status,
  fact_id uuid,
  timeline_event_id uuid,
  knowledge_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.continuity_inbox_items%rowtype;
  v_fact_id uuid;
  v_timeline_event_id uuid;
  v_knowledge_id uuid;
  v_chapter_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_decision = 'pending' then
    raise exception 'review decision must leave pending state' using errcode = '22023';
  end if;

  select *
  into v_item
  from public.continuity_inbox_items i
  where i.id = p_item_id
    and i.owner_id = v_user_id
  for update;

  if not found then
    raise exception 'continuity inbox item not found' using errcode = 'P0002';
  end if;

  if v_item.review_status <> 'pending' then
    select f.id into v_fact_id
    from public.continuity_facts f
    where f.source_inbox_item_id = v_item.id;

    select t.id into v_timeline_event_id
    from public.continuity_timeline_events t
    where t.source_inbox_item_id = v_item.id;

    select k.id into v_knowledge_id
    from public.continuity_character_knowledge k
    where k.source_inbox_item_id = v_item.id;

    return query select
      v_item.review_status,
      v_fact_id,
      v_timeline_event_id,
      v_knowledge_id;
    return;
  end if;

  if p_decision in ('intentional', 'retcon') and v_item.kind <> 'alert' then
    raise exception 'only alerts can use this review decision' using errcode = '22023';
  end if;

  if p_decision = 'retcon' then
    if v_item.alert_kind <> 'state_conflict'
       or coalesce(v_item.metadata ->> 'factId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'retcon requires a state-conflict fact' using errcode = '22023';
    end if;

    update public.continuity_facts f
    set status = 'retconned'
    where f.id = (v_item.metadata ->> 'factId')::uuid
      and f.story_id = v_item.story_id
      and f.owner_id = v_item.owner_id
    returning f.id into v_fact_id;

    if v_fact_id is null then
      raise exception 'superseded fact not found' using errcode = 'P0002';
    end if;
  end if;

  if p_decision = 'accepted' then
    if v_item.kind <> 'alert'
       and (
         p_record_status is null
         or p_record_status not in ('canon', 'inference', 'disputed')
       ) then
      raise exception 'accepted records require an explicit certainty' using errcode = '22023';
    end if;

    select e.chapter_id
    into v_chapter_id
    from public.continuity_inbox_evidence e
    where e.inbox_item_id = v_item.id
    order by e.start_line nulls last, e.id
    limit 1;

    if v_item.kind in ('state_change', 'location_change', 'possession_change') then
      insert into public.continuity_facts (
        owner_id,
        story_id,
        entity_id,
        statement,
        status,
        source_inbox_item_id
      ) values (
        v_item.owner_id,
        v_item.story_id,
        v_item.subject_entity_id,
        v_item.statement,
        p_record_status,
        v_item.id
      )
      returning id into v_fact_id;

      insert into public.continuity_evidence (
        owner_id,
        story_id,
        fact_id,
        chapter_id,
        chapter_revision_id,
        source_kind,
        source_label,
        source_anchor_id,
        start_line,
        end_line,
        excerpt
      )
      select
        e.owner_id,
        e.story_id,
        v_fact_id,
        e.chapter_id,
        e.chapter_revision_id,
        'direct_source'::public.continuity_evidence_kind,
        e.source_label,
        e.source_anchor_id,
        e.start_line,
        e.end_line,
        e.excerpt
      from public.continuity_inbox_evidence e
      where e.inbox_item_id = v_item.id;
    elsif v_item.kind = 'knowledge_claim' then
      if v_item.subject_entity_id is null or p_knowledge_state is null then
        raise exception 'knowledge acceptance requires character and state' using errcode = '22023';
      end if;

      insert into public.continuity_character_knowledge (
        owner_id,
        story_id,
        character_entity_id,
        knowledge_text,
        knowledge_state,
        is_secret,
        certainty,
        acquired_chapter_id,
        chapter_sequence,
        source_inbox_item_id
      ) values (
        v_item.owner_id,
        v_item.story_id,
        v_item.subject_entity_id,
        v_item.statement,
        p_knowledge_state,
        case
          when v_item.metadata ->> 'isSecret' = 'false' then false
          else true
        end,
        p_record_status,
        v_chapter_id,
        case
          when coalesce(v_item.metadata ->> 'chapterSequence', '') ~ '^\d+$'
            then (v_item.metadata ->> 'chapterSequence')::integer
          else null
        end,
        v_item.id
      )
      returning id into v_knowledge_id;
    elsif v_item.kind = 'timeline_event' then
      insert into public.continuity_timeline_events (
        owner_id,
        story_id,
        participant_entity_id,
        location_entity_id,
        title,
        time_start,
        time_end,
        chapter_sequence,
        certainty,
        source_inbox_item_id
      ) values (
        v_item.owner_id,
        v_item.story_id,
        v_item.subject_entity_id,
        v_item.related_entity_id,
        v_item.statement,
        nullif(v_item.metadata ->> 'timeLabel', ''),
        nullif(v_item.metadata ->> 'timeEnd', ''),
        case
          when coalesce(v_item.metadata ->> 'chapterSequence', '') ~ '^\d+$'
            then (v_item.metadata ->> 'chapterSequence')::integer
          else null
        end,
        p_record_status,
        v_item.id
      )
      returning id into v_timeline_event_id;
    end if;
  end if;

  update public.continuity_inbox_items
  set review_status = p_decision,
      reviewed_at = now()
  where id = v_item.id;

  return query select
    p_decision,
    v_fact_id,
    v_timeline_event_id,
    v_knowledge_id;
end;
$$;

revoke all on function public.review_continuity_inbox_item(
  uuid,
  public.continuity_review_status,
  public.continuity_fact_status,
  public.continuity_knowledge_state
) from public, anon;

grant execute on function public.review_continuity_inbox_item(
  uuid,
  public.continuity_review_status,
  public.continuity_fact_status,
  public.continuity_knowledge_state
) to authenticated;

revoke all privileges on table
  public.continuity_analysis_runs,
  public.continuity_inbox_items,
  public.continuity_inbox_evidence,
  public.continuity_timeline_events,
  public.continuity_character_knowledge
from anon;

grant select, insert, update, delete on table
  public.continuity_analysis_runs,
  public.continuity_inbox_items,
  public.continuity_timeline_events,
  public.continuity_character_knowledge
to authenticated, service_role;

grant select, insert, delete on table
  public.continuity_inbox_evidence
to authenticated, service_role;

comment on table public.continuity_analysis_runs is
  'One idempotent deterministic Continuity Studio analysis per story version.';
comment on table public.continuity_inbox_items is
  'Untrusted extraction candidates and evidence-backed alerts awaiting author review.';
comment on table public.continuity_inbox_evidence is
  'Stable chapter revision and line pointers for every P1 candidate or alert.';
comment on table public.continuity_timeline_events is
  'Author-accepted timeline events; never populated without inbox review.';
comment on table public.continuity_character_knowledge is
  'Author-accepted character knowledge states with acquisition provenance.';
