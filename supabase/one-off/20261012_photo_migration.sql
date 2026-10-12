-- ImmoCongo — one-time move of the OLD base64 photos to Storage.
-- RUN ONLY AFTER JUNIOR'S YES. Nothing here has been run on the real listings yet.
--
-- Order:
--   1. Backup:  apply supabase/migrations/20261012_listing_photos_backup.sql
--   2. Upload:  `npm run dev`, open http://localhost:5173, then in the browser console:
--                 const m = await import("/scripts/migrate-photos.js");
--                 await m.uploadAll({ token: "<one-time token>", run: "apply" });
--               (needs the temporary Edge Function "migrate-listing-photos" deployed with
--               that token's SHA-256). Every copy is downloaded back and checked.
--   3. Switch:  run SWITCH below once with dry_run := true (it only reports, then rolls back),
--               then again with dry_run := false.
--   4. Check the live site. If anything is wrong: run UNDO.
--   5. Clean up: delete the Edge Function "migrate-listing-photos" (Supabase dashboard >
--               Edge Functions). After a few good weeks: drop table public.listing_photos_backup.

-- SWITCH ---------------------------------------------------------------------
-- All or nothing: refuses to change anything if a backup row is missing or different,
-- or if any base64 photo has no checked copy in Storage.
do $$
declare
  dry_run constant boolean := true;      -- set to false to really switch
  folder constant text := 'migrated';    -- 'dryrun-migration' only for tests
  base constant text := 'https://nnkrofhjhjyyprqhwbjv.supabase.co/storage/v1/object/public/listing-photos/';
  r record;
  p record;
  obj record;
  new_photos jsonb;
  summary text := '';
begin
  for r in
    select l.id, l.owner_id, l.images, l.image_url
    from public.listings l
    where l.image_url like 'data:%' or l.images like '%data:%'
    order by l.id
    for update
  loop
    if not exists (
      select 1 from public.listing_photos_backup b
      where b.listing_id = r.id
        and b.images is not distinct from r.images
        and b.image_url is not distinct from r.image_url
    ) then
      raise exception 'Listing %: no identical backup row. Apply the backup migration first.', r.id;
    end if;

    -- Same rule as the website: the images array, or image_url when the array is empty/missing.
    new_photos := '[]'::jsonb;
    for p in
      select x.photo
      from jsonb_array_elements_text(
        case when coalesce(jsonb_array_length(case when r.images ~ '^\s*\[' then r.images::jsonb end), 0) > 0
             then r.images::jsonb
             else jsonb_build_array(r.image_url) end
      ) with ordinality as x(photo, ord)
      order by x.ord
    loop
      if p.photo like 'data:%' then
        select o.name, (o.metadata->>'size')::int as size, o.metadata->>'mimetype' as mimetype
        into obj
        from storage.objects o
        where o.bucket_id = 'listing-photos'
          and o.name like r.owner_id || '/' || folder || '/' || r.id || '-'
                          || substr(encode(sha256(convert_to(p.photo, 'UTF8')), 'hex'), 1, 12) || '.%'
        order by o.created_at desc
        limit 1;
        if not found then
          raise exception 'Listing %: a photo has no uploaded copy in %/. Run the upload step first.', r.id, folder;
        end if;
        if obj.size is null or obj.size < 1024 or obj.mimetype not in ('image/webp', 'image/jpeg') then
          raise exception 'Listing %: copy % looks wrong (% bytes, %).', r.id, obj.name, obj.size, obj.mimetype;
        end if;
        new_photos := new_photos || to_jsonb(base || obj.name);
      else
        new_photos := new_photos || to_jsonb(p.photo);
      end if;
    end loop;

    summary := summary || format(E'\n  listing %s: %s photo(s) -> %s', r.id, jsonb_array_length(new_photos), new_photos::text);
    update public.listings set images = new_photos::text, image_url = new_photos->>0 where id = r.id;
  end loop;

  if summary = '' then
    raise notice 'Nothing to switch: no listing has base64 photos.';
    return;
  end if;
  if dry_run then
    raise exception 'DRY RUN ONLY, nothing was changed. Would set:%', summary;
  end if;
  raise notice 'Switched:%', summary;
end $$;

-- UNDO -----------------------------------------------------------------------
-- Puts the old base64 photos back exactly as they were before the switch.
-- Warning: photo changes made on those listings after the switch would be lost.
-- The Storage copies stay (harmless) and can be removed later.
--
-- update public.listings l
-- set images = b.images, image_url = b.image_url
-- from public.listing_photos_backup b
-- where b.listing_id = l.id;
