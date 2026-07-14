-- Slice 6: Media storage for avatars and cover images

-- 1. Add cover_image_url to stories
alter table public.stories
add column if not exists cover_image_url text;

-- 2. Create public media bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  5242880, -- 5MB limit
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do nothing;

-- 3. RLS for media bucket
-- Allow public read access to all files in 'media'
drop policy if exists media_select_public on storage.objects;
create policy media_select_public on storage.objects
  for select using (bucket_id = 'media');

-- Allow authenticated users to upload files only to their own folder: media/{user_id}/...
drop policy if exists media_insert_own on storage.objects;
create policy media_insert_own on storage.objects
  for insert with check (
    bucket_id = 'media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to update their own files
drop policy if exists media_update_own on storage.objects;
create policy media_update_own on storage.objects
  for update using (
    bucket_id = 'media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to delete their own files
drop policy if exists media_delete_own on storage.objects;
create policy media_delete_own on storage.objects
  for delete using (
    bucket_id = 'media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
