-- ImmoCongo — Fast photos: private backup of the OLD base64 photo columns.
-- Step 1 of the one-time photo move (see supabase/one-off/20261012_photo_migration.sql).
-- Apply ONLY when the move is approved, right before the switch, so the copy is fresh.
-- Safe to re-run: never overwrites an existing backup row.

create table if not exists public.listing_photos_backup (
  listing_id bigint primary key,   -- no foreign key on purpose: the backup outlives a deleted listing
  images text,
  image_url text,
  backed_up_at timestamptz not null default now()
);

-- RLS on and NO policies on purpose: visitors and signed-in users can't read or change it.
alter table public.listing_photos_backup enable row level security;
revoke all on public.listing_photos_backup from anon, authenticated;

insert into public.listing_photos_backup (listing_id, images, image_url)
select id, images, image_url
from public.listings
where image_url like 'data:%' or images like '%data:%'
on conflict (listing_id) do nothing;
