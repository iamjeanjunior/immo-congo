-- ImmoCongo — BASELINE: the production database schema as of 2026-10-12.
--
-- Read from production (project nnkrofhjhjyyprqhwbjv) with read-only catalog queries
-- (columns, constraints, indexes, RLS policies, functions, triggers, grants, Storage bucket,
-- Realtime publication). It replaces the older hand-written files, which are kept as history
-- in supabase/history/ and in supabase_migration.sql.
--
-- !! NEVER apply this file to production: production already has all of it. !!
-- It only builds the LOCAL test copy (`npm run test:e2e`, `npx supabase db reset`).
-- Every later change gets its own new file in supabase/migrations/ (see CLAUDE.md).
--
-- Policy names, column order and types (including the two `timestamp without time zone`
-- columns and the duplicate SELECT policy on profiles) are copied from production on purpose,
-- so the local copy behaves exactly like the live site.

-- 1. profiles -----------------------------------------------------------------
create table if not exists public.profiles (
  id uuid not null,
  nom text not null,
  whatsapp text,
  role text default 'user'::text,
  created_at timestamp without time zone default now(),
  verified boolean not null default false,
  constraint profiles_pkey primary key (id),
  constraint profiles_id_fkey foreign key (id) references auth.users(id)
);
alter table public.profiles enable row level security;

drop policy if exists "Profils visibles par tous" on public.profiles;
create policy "Profils visibles par tous" on public.profiles
  for select using (true);

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (true);

drop policy if exists "Créer son profil" on public.profiles;
create policy "Créer son profil" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Modifier son profil" on public.profiles;
create policy "Modifier son profil" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update using (
    auth.uid() = id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- 2. listings -----------------------------------------------------------------
create table if not exists public.listings (
  id bigint generated always as identity,
  titre text not null,
  prix numeric not null,
  devise text default 'USD'::text,
  localisation text not null,
  ville text not null,
  chambres integer default 0,
  description text not null,
  whatsapp text,
  disponible boolean default true,
  image_url text,
  owner_id uuid,
  owner_name text,
  created_at timestamp without time zone default now(),
  images text,
  views integer not null default 0,
  constraint listings_pkey primary key (id),
  constraint listings_owner_id_fkey foreign key (owner_id) references public.profiles(id)
);
alter table public.listings enable row level security;

drop policy if exists "Annonces visibles par tous" on public.listings;
create policy "Annonces visibles par tous" on public.listings
  for select using (true);

drop policy if exists "Publier si connecté" on public.listings;
create policy "Publier si connecté" on public.listings
  for insert with check (auth.uid() = owner_id);

drop policy if exists "Modifier ses propres annonces" on public.listings;
create policy "Modifier ses propres annonces" on public.listings
  for update using (auth.uid() = owner_id);

drop policy if exists "Supprimer ses propres annonces" on public.listings;
create policy "Supprimer ses propres annonces" on public.listings
  for delete using (auth.uid() = owner_id);

drop policy if exists "listings_admin_all" on public.listings;
create policy "listings_admin_all" on public.listings
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- 3. favorites ----------------------------------------------------------------
create table if not exists public.favorites (
  id bigint generated always as identity,
  user_id uuid not null,
  listing_id bigint not null,
  created_at timestamp with time zone not null default now(),
  constraint favorites_pkey primary key (id),
  constraint favorites_user_id_listing_id_key unique (user_id, listing_id),
  constraint favorites_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade,
  constraint favorites_listing_id_fkey foreign key (listing_id) references public.listings(id) on delete cascade
);
alter table public.favorites enable row level security;

drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own" on public.favorites
  for select using (auth.uid() = user_id);

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own" on public.favorites
  for insert with check (auth.uid() = user_id);

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own" on public.favorites
  for delete using (auth.uid() = user_id);

-- 4. reviews ------------------------------------------------------------------
create table if not exists public.reviews (
  id bigint generated always as identity,
  listing_id bigint not null,
  user_id uuid not null,
  reviewer_name text not null,
  rating smallint not null,
  comment text,
  created_at timestamp with time zone not null default now(),
  constraint reviews_pkey primary key (id),
  constraint reviews_rating_check check (((rating >= 1) and (rating <= 5))),
  constraint reviews_listing_id_fkey foreign key (listing_id) references public.listings(id) on delete cascade,
  constraint reviews_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);
alter table public.reviews enable row level security;

drop policy if exists "reviews_select_all" on public.reviews;
create policy "reviews_select_all" on public.reviews
  for select using (true);

drop policy if exists "reviews_insert_own" on public.reviews;
create policy "reviews_insert_own" on public.reviews
  for insert with check (auth.uid() = user_id);

drop policy if exists "reviews_delete_own_or_admin" on public.reviews;
create policy "reviews_delete_own_or_admin" on public.reviews
  for delete using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- 5. conversations + messages ----------------------------------------------------
create table if not exists public.conversations (
  id bigint generated always as identity,
  listing_id bigint not null,
  listing_title text not null,
  buyer_id uuid not null,
  buyer_name text not null,
  owner_id uuid not null,
  owner_name text not null,
  created_at timestamp with time zone not null default now(),
  constraint conversations_pkey primary key (id),
  constraint conversations_listing_id_buyer_id_key unique (listing_id, buyer_id),
  constraint conversations_listing_id_fkey foreign key (listing_id) references public.listings(id) on delete cascade,
  constraint conversations_buyer_id_fkey foreign key (buyer_id) references auth.users(id) on delete cascade,
  constraint conversations_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete cascade
);
alter table public.conversations enable row level security;

drop policy if exists "conversations_select_participant" on public.conversations;
create policy "conversations_select_participant" on public.conversations
  for select using (auth.uid() = buyer_id or auth.uid() = owner_id);

drop policy if exists "conversations_insert_buyer" on public.conversations;
create policy "conversations_insert_buyer" on public.conversations
  for insert with check (auth.uid() = buyer_id);

create table if not exists public.messages (
  id bigint generated always as identity,
  conversation_id bigint not null,
  sender_id uuid not null,
  content text not null,
  created_at timestamp with time zone not null default now(),
  constraint messages_pkey primary key (id),
  constraint messages_conversation_id_fkey foreign key (conversation_id) references public.conversations(id) on delete cascade,
  constraint messages_sender_id_fkey foreign key (sender_id) references auth.users(id) on delete cascade
);
alter table public.messages enable row level security;

drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and (c.buyer_id = auth.uid() or c.owner_id = auth.uid())
    )
  );

drop policy if exists "messages_insert_participant" on public.messages;
create policy "messages_insert_participant" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and (c.buyer_id = auth.uid() or c.owner_id = auth.uid())
    )
  );

-- Realtime: live chat listens to new rows in messages.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- 6. listing_photos_backup (temporary private backup of the old base64 photos) ----
-- Production keeps it until about 2026-11-09 (see ROADMAP.md). Structure only, no data here.
create table if not exists public.listing_photos_backup (
  listing_id bigint not null,
  images text,
  image_url text,
  backed_up_at timestamp with time zone not null default now(),
  constraint listing_photos_backup_pkey primary key (listing_id)
);
alter table public.listing_photos_backup enable row level security;
revoke all on public.listing_photos_backup from anon, authenticated;

-- 7. Functions and triggers ------------------------------------------------------
-- View counter (bypasses RLS safely, only increments).
create or replace function public.increment_views(p_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.listings set views = coalesce(views, 0) + 1 where id = p_id;
end;
$function$;
grant execute on function public.increment_views(bigint) to anon, authenticated;

-- Every new account gets its profile (name + WhatsApp from the signup data; role always 'user').
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  begin
    insert into public.profiles (id, nom, whatsapp, role)
    values (
      new.id,
      coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nom'), ''), 'Utilisateur'),
      nullif(btrim(new.raw_user_meta_data ->> 'whatsapp'), ''),
      'user'
    )
    on conflict (id) do nothing;
  exception when others then
    raise warning 'handle_new_user: profile not created for user %: %', new.id, sqlerrm;
  end;
  return new;
end;
$function$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only an admin (or server-side code with no signed-in user) may set or change role / verified.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  requester uuid := auth.uid();
begin
  -- No signed-in user: server-side code (signup trigger, SQL editor, service role).
  -- Visitors without an account can't reach this: RLS on profiles requires auth.uid() = id.
  if requester is null then
    return new;
  end if;

  -- Admins may change anything.
  if exists (select 1 from public.profiles p where p.id = requester and p.role = 'admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.role, 'user') <> 'user' or coalesce(new.verified, false) then
      raise exception 'Only an admin can set role or verified' using errcode = '42501';
    end if;
  elsif new.role is distinct from old.role or new.verified is distinct from old.verified then
    raise exception 'Only an admin can change role or verified' using errcode = '42501';
  end if;

  return new;
end;
$function$;
revoke execute on function public.protect_profile_privileges() from public, anon, authenticated;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges
  before insert or update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- 8. Storage: listing photos ------------------------------------------------------
-- Public bucket, 1 MB per file, only real image types. Files live at <user id>/<file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "listing_photos_insert_own_folder" on storage.objects;
create policy "listing_photos_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "listing_photos_select_own_folder" on storage.objects;
create policy "listing_photos_select_own_folder" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

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

drop policy if exists "listing_photos_delete_own_folder" on storage.objects;
create policy "listing_photos_delete_own_folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
