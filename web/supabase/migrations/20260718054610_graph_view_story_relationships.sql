create type public.story_relationship_type as enum (
  'sequel',
  'spinoff',
  'side_story',
  'adaptation',
  'related'
);

create table public.story_relationships (
  id uuid primary key default gen_random_uuid(),
  source_story_id uuid not null
    references public.stories (id) on delete cascade,
  target_story_id uuid not null
    references public.stories (id) on delete cascade,
  relationship_type public.story_relationship_type not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint story_relationships_no_self_link
    check (source_story_id <> target_story_id)
);

create index story_relationships_source_idx
  on public.story_relationships (source_story_id);

create index story_relationships_target_idx
  on public.story_relationships (target_story_id);

create unique index story_relationships_unordered_pair_uidx
  on public.story_relationships (
    least(source_story_id, target_story_id),
    greatest(source_story_id, target_story_id)
  );

create trigger story_relationships_set_updated_at
  before update on public.story_relationships
  for each row
  execute function public.set_updated_at();

alter table public.story_relationships enable row level security;

create policy story_relationships_select_own
  on public.story_relationships
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.stories source
      join public.stories target
        on target.id = story_relationships.target_story_id
      where source.id = story_relationships.source_story_id
        and source.owner_id = (select auth.uid())
        and target.owner_id = (select auth.uid())
    )
  );

create policy story_relationships_insert_own
  on public.story_relationships
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.stories source
      join public.stories target
        on target.id = story_relationships.target_story_id
      where source.id = story_relationships.source_story_id
        and source.owner_id = (select auth.uid())
        and target.owner_id = (select auth.uid())
    )
  );

create policy story_relationships_update_own
  on public.story_relationships
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.stories source
      join public.stories target
        on target.id = story_relationships.target_story_id
      where source.id = story_relationships.source_story_id
        and source.owner_id = (select auth.uid())
        and target.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.stories source
      join public.stories target
        on target.id = story_relationships.target_story_id
      where source.id = story_relationships.source_story_id
        and source.owner_id = (select auth.uid())
        and target.owner_id = (select auth.uid())
    )
  );

create policy story_relationships_delete_own
  on public.story_relationships
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.stories source
      join public.stories target
        on target.id = story_relationships.target_story_id
      where source.id = story_relationships.source_story_id
        and source.owner_id = (select auth.uid())
        and target.owner_id = (select auth.uid())
    )
  );

revoke all privileges
  on table public.story_relationships
  from anon;

grant select, insert, update, delete
  on table public.story_relationships
  to authenticated, service_role;
