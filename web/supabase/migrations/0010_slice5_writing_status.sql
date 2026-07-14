-- Slice 5 pilot UI: track each story's writing/composition phase separately
-- from its library visibility status (active/archived/deleting).

do $$ begin
  create type public.story_writing_status as enum (
    'idea',
    'outlining',
    'drafting',
    'revising',
    'completed',
    'paused'
  );
exception when duplicate_object then null;
end $$;

alter table public.stories
  add column if not exists writing_status public.story_writing_status not null default 'drafting';

create index if not exists stories_owner_writing_status_idx
  on public.stories (owner_id, writing_status);

comment on column public.stories.writing_status is
  'Author-facing writing/composition progress; separate from reader progress and archive status.';
