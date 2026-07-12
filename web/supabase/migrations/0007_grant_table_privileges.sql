-- Fix: migrations 0001-0006 created tables while connected as the `postgres`
-- role. On this platform, `postgres`'s default ACL for the public schema
-- only carries REFERENCES/TRIGGER/TRUNCATE to anon/authenticated/
-- service_role — not SELECT/INSERT/UPDATE/DELETE (that full grant is only
-- automatic for tables created as `supabase_admin`). RLS policies only
-- filter *rows*; without this table-level GRANT, every DML statement was
-- rejected with 42501 before RLS was ever evaluated. No table in this
-- schema has an anon-facing policy yet (story_visibility is 'private'-only
-- today), so anon gets nothing here.
grant select, insert, update, delete on table
  public.stories,
  public.sections,
  public.chapters,
  public.chapter_revisions,
  public.story_versions,
  public.reading_progress,
  public.reading_settings,
  public.chapter_read_states,
  public.import_jobs
  to authenticated, service_role;

-- Ensures tables added by future migrations (run as `postgres`, same as
-- these) don't silently reintroduce the same gap.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
