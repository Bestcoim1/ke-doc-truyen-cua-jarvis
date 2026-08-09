-- P1: tighten Storage/Auth-adjacent database controls and remove the
-- performance warnings that are actionable before the dataset grows.

-- Keep the public media bucket (avatars are rendered through public URLs),
-- but enforce the same limits as the application and reject non-image MIME
-- types at the Storage API boundary. Import sources stay private.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif'
    ]::text[]
where id = 'media';

update storage.buckets
set file_size_limit = 15728640,
    allowed_mime_types = array[
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]::text[]
where id = 'story-sources';

-- A public bucket already permits unauthenticated object downloads through
-- its public URL. Metadata listing still goes through RLS and should remain
-- owner-only.
drop policy if exists media_select_public on storage.objects;
drop policy if exists media_select_own on storage.objects;
create policy media_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

alter policy media_insert_own
  on storage.objects
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

alter policy media_update_own
  on storage.objects
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

alter policy media_delete_own
  on storage.objects
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

alter policy story_sources_select_own
  on storage.objects
  to authenticated
  using (
    bucket_id = 'story-sources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

alter policy story_sources_insert_own
  on storage.objects
  to authenticated
  with check (
    bucket_id = 'story-sources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

alter policy story_sources_update_own
  on storage.objects
  to authenticated
  using (
    bucket_id = 'story-sources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'story-sources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

alter policy story_sources_delete_own
  on storage.objects
  to authenticated
  using (
    bucket_id = 'story-sources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Scope tenant policies to signed-in users and evaluate auth.uid() once per
-- statement instead of once per row.
alter policy stories_select_own on public.stories
  to authenticated using ((select auth.uid()) = owner_id);
alter policy stories_insert_own on public.stories
  to authenticated with check ((select auth.uid()) = owner_id);
alter policy stories_update_own on public.stories
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
alter policy stories_delete_own on public.stories
  to authenticated using ((select auth.uid()) = owner_id);

alter policy sections_owner_all on public.sections
  to authenticated
  using (
    exists (
      select 1 from public.stories s
      where s.id = sections.story_id
        and s.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.stories s
      where s.id = sections.story_id
        and s.owner_id = (select auth.uid())
    )
  );

alter policy chapters_owner_all on public.chapters
  to authenticated
  using (
    exists (
      select 1 from public.stories s
      where s.id = chapters.story_id
        and s.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.stories s
      where s.id = chapters.story_id
        and s.owner_id = (select auth.uid())
    )
  );

alter policy chapter_revisions_owner_all on public.chapter_revisions
  to authenticated
  using (
    exists (
      select 1
      from public.chapters c
      join public.stories s on s.id = c.story_id
      where c.id = chapter_revisions.chapter_id
        and s.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.chapters c
      join public.stories s on s.id = c.story_id
      where c.id = chapter_revisions.chapter_id
        and s.owner_id = (select auth.uid())
    )
  );

alter policy reading_progress_owner_all on public.reading_progress
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy chapter_read_states_owner_all on public.chapter_read_states
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy reading_settings_owner_all on public.reading_settings
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy import_jobs_select_own on public.import_jobs
  to authenticated using ((select auth.uid()) = owner_id);
alter policy import_jobs_insert_own on public.import_jobs
  to authenticated
  with check (
    (select auth.uid()) = owner_id
    and (
      story_id is null
      or exists (
        select 1 from public.stories s
        where s.id = import_jobs.story_id
          and s.owner_id = (select auth.uid())
      )
    )
  );
alter policy import_jobs_update_own on public.import_jobs
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and (
      story_id is null
      or exists (
        select 1 from public.stories s
        where s.id = import_jobs.story_id
          and s.owner_id = (select auth.uid())
      )
    )
  );
alter policy import_jobs_delete_own on public.import_jobs
  to authenticated using ((select auth.uid()) = owner_id);

alter policy story_versions_select_own on public.story_versions
  to authenticated
  using (
    exists (
      select 1 from public.stories s
      where s.id = story_versions.story_id
        and s.owner_id = (select auth.uid())
    )
  );
alter policy story_versions_insert_own on public.story_versions
  to authenticated
  with check (
    exists (
      select 1
      from public.stories s
      join public.import_jobs j
        on j.id = story_versions.import_job_id
       and j.story_id = story_versions.story_id
      where s.id = story_versions.story_id
        and s.owner_id = (select auth.uid())
        and j.owner_id = (select auth.uid())
    )
  );
alter policy story_versions_update_own on public.story_versions
  to authenticated
  using (
    exists (
      select 1 from public.stories s
      where s.id = story_versions.story_id
        and s.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.stories s
      join public.import_jobs j
        on j.id = story_versions.import_job_id
       and j.story_id = story_versions.story_id
      where s.id = story_versions.story_id
        and s.owner_id = (select auth.uid())
        and j.owner_id = (select auth.uid())
    )
  );
alter policy story_versions_delete_own on public.story_versions
  to authenticated
  using (
    exists (
      select 1 from public.stories s
      where s.id = story_versions.story_id
        and s.owner_id = (select auth.uid())
    )
  );

-- Pin the lookup path of every legacy application function. The dynamic form
-- also hardens update_updated_at_column() if it exists on an older remote
-- project even though fresh databases do not contain that legacy helper.
do $hardening$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname = any (array[
        'set_updated_at',
        'validate_section_depth',
        'upsert_chapter_progress',
        'validate_chapter_section',
        'validate_reading_progress_refs',
        'validate_chapter_read_state_refs',
        'upsert_reading_progress',
        'preserve_story_version_identity',
        'validate_chapter_revision_version',
        'validate_chapter_version_refs',
        'update_updated_at_column'
      ])
  loop
    execute format(
      'alter function %s set search_path = pg_catalog, public',
      fn
    );
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      fn
    );
  end loop;
end
$hardening$;

grant execute on function public.upsert_chapter_progress(
  uuid, uuid, uuid, text, text, numeric, boolean, public.completion_method
) to authenticated, service_role;
grant execute on function public.upsert_reading_progress(
  uuid, uuid, uuid, text, text, integer, numeric, numeric, uuid, timestamptz
) to authenticated, service_role;

-- Index each foreign-key column prefix that is not already covered. These
-- protect parent deletes/updates and common ownership joins as data grows.
create index if not exists chapter_read_states_chapter_id_idx
  on public.chapter_read_states (chapter_id);
create index if not exists chapter_read_states_last_revision_id_idx
  on public.chapter_read_states (last_revision_id);
create index if not exists chapter_read_states_story_id_idx
  on public.chapter_read_states (story_id);
create index if not exists chapter_revisions_created_in_version_id_idx
  on public.chapter_revisions (created_in_version_id);
create index if not exists chapters_archived_version_story_idx
  on public.chapters (archived_in_version_id, story_id);
create index if not exists chapters_current_revision_id_idx
  on public.chapters (current_revision_id, id);
create index if not exists chapters_section_id_idx
  on public.chapters (section_id);
create index if not exists import_jobs_story_owner_idx
  on public.import_jobs (story_id, owner_id);
create index if not exists reading_progress_chapter_id_idx
  on public.reading_progress (chapter_id);
create index if not exists reading_progress_chapter_revision_id_idx
  on public.reading_progress (chapter_revision_id);
create index if not exists reading_progress_story_id_idx
  on public.reading_progress (story_id);
create index if not exists sections_parent_section_id_idx
  on public.sections (parent_section_id);
create index if not exists story_versions_import_job_story_idx
  on public.story_versions (import_job_id, story_id);
