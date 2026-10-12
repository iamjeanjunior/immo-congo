-- ImmoCongo — Fast photos: Supabase Storage bucket for listing photos.
-- Safe to re-run (on conflict / drop policy if exists).
--
-- Files live at  listing-photos/<user id>/<file>.
-- Reading: the bucket is public, so anyone can open a photo by its public URL
-- (no SELECT policy is needed for that, and none is given to visitors, so
-- nobody can list the whole bucket).
-- Writing: a signed-in user can only upload, replace or delete files inside
-- the folder named after their own user id.

-- 1. Bucket: public, 1 MB max per file, only real image types ---------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Policies on storage.objects (only for this bucket) ----------------------
-- Upload: only into your own folder.
drop policy if exists "listing_photos_insert_own_folder" on storage.objects;
create policy "listing_photos_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- See your own files (Storage needs this to delete or replace them).
drop policy if exists "listing_photos_select_own_folder" on storage.objects;
create policy "listing_photos_select_own_folder" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Replace: only your own files, and they must stay in your folder.
drop policy if exists "listing_photos_update_own_folder" on storage.objects;
create policy "listing_photos_update_own_folder" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Delete: only your own files.
drop policy if exists "listing_photos_delete_own_folder" on storage.objects;
create policy "listing_photos_delete_own_folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
