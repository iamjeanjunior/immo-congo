-- ImmoCongo — trust fixes (ROADMAP Phase 1, "Trust fixes").
--
-- Safe for the live site's code as it is today: these triggers quietly put the right value in
-- place, they never refuse a request the website sends. Nothing here rewrites existing rows.
--
-- 1. Names come from the author's profile (profiles.nom), set by the database, not by the browser:
--    listings.owner_name, reviews.reviewer_name, conversations.buyer_name / owner_name.
--    When someone changes their profile name, their listings, reviews and conversations follow.
-- 2. listings.views: only increment_views() can change the view count.
-- 3. conversations: always with the real owner of an existing listing (and its real title).
-- 5. Storage: admins can list and delete photo files in every folder of `listing-photos`
--    (so deleting or editing someone else's listing also removes its old photo files).

-- 1a. listings.owner_name = the owner's profile name ------------------------------------
-- Also when an admin edits someone else's listing: the name follows owner_id, not the editor.
create or replace function public.set_listing_owner_name()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  new.owner_name := (select p.nom from public.profiles p where p.id = new.owner_id);
  return new;
end;
$function$;
revoke execute on function public.set_listing_owner_name() from public, anon, authenticated;

drop trigger if exists set_listing_owner_name on public.listings;
create trigger set_listing_owner_name
  before insert or update on public.listings
  for each row execute function public.set_listing_owner_name();

-- 1b. reviews.reviewer_name = the reviewer's profile name --------------------------------
-- An old account without a profile is shown as "Utilisateur" (the name follows once it gets one).
create or replace function public.set_reviewer_name()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  new.reviewer_name := coalesce((select p.nom from public.profiles p where p.id = new.user_id), 'Utilisateur');
  return new;
end;
$function$;
revoke execute on function public.set_reviewer_name() from public, anon, authenticated;

drop trigger if exists set_reviewer_name on public.reviews;
create trigger set_reviewer_name
  before insert or update on public.reviews
  for each row execute function public.set_reviewer_name();

-- 1c + 3. conversations: real owner, real listing title, names from profiles ---------------
-- On a new conversation the owner is always the listing's owner, whatever the browser sent.
-- (Conversations can't be changed by users: there is no UPDATE policy. Server-side updates,
-- like a name change below, keep the owner and title and only refresh the names.)
create or replace function public.set_conversation_parties()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  listing_owner uuid;
  listing_titre text;
begin
  if tg_op = 'INSERT' then
    select l.owner_id, l.titre into listing_owner, listing_titre
    from public.listings l where l.id = new.listing_id;
    if not found then
      raise exception 'Listing % does not exist', new.listing_id using errcode = '23503';
    end if;
    new.owner_id := listing_owner; -- null (listing without owner) is refused by NOT NULL
    new.listing_title := listing_titre;
  end if;
  new.buyer_name := coalesce((select p.nom from public.profiles p where p.id = new.buyer_id), 'Utilisateur');
  new.owner_name := coalesce((select p.nom from public.profiles p where p.id = new.owner_id), 'Utilisateur');
  return new;
end;
$function$;
revoke execute on function public.set_conversation_parties() from public, anon, authenticated;

drop trigger if exists set_conversation_parties on public.conversations;
create trigger set_conversation_parties
  before insert or update on public.conversations
  for each row execute function public.set_conversation_parties();

-- 1d. A profile name change follows on the person's listings, reviews and conversations ---
-- The triggers above put the profile name back in each touched row.
create or replace function public.sync_profile_name()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'UPDATE' and new.nom is not distinct from old.nom then
    return null;
  end if;
  update public.listings set owner_name = new.nom
    where owner_id = new.id and owner_name is distinct from new.nom;
  update public.reviews set reviewer_name = new.nom
    where user_id = new.id and reviewer_name is distinct from new.nom;
  update public.conversations set buyer_name = new.nom
    where buyer_id = new.id and buyer_name is distinct from new.nom;
  update public.conversations set owner_name = new.nom
    where owner_id = new.id and owner_name is distinct from new.nom;
  return null;
end;
$function$;
revoke execute on function public.sync_profile_name() from public, anon, authenticated;

drop trigger if exists sync_profile_name on public.profiles;
create trigger sync_profile_name
  after insert or update of nom on public.profiles
  for each row execute function public.sync_profile_name();

-- 2. listings.views: only increment_views() may change it ----------------------------------
-- Requests from the website run as "anon" or "authenticated": for them the old count is kept
-- (0 for a new listing), silently. increment_views() is SECURITY DEFINER, so inside it
-- current_user is the function's owner (postgres) and the count can go up.
-- This function must stay SECURITY INVOKER, or current_user would always be its owner.
create or replace function public.protect_listing_views()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.views := 0;
    else
      new.views := old.views;
    end if;
  end if;
  return new;
end;
$function$;
revoke execute on function public.protect_listing_views() from public, anon, authenticated;

drop trigger if exists protect_listing_views on public.listings;
create trigger protect_listing_views
  before insert or update on public.listings
  for each row execute function public.protect_listing_views();

-- 5. Storage: admins may list and delete files in every folder of listing-photos -----------
-- Deleting needs both rules: the Storage API reads the rows it deletes.
drop policy if exists "listing_photos_admin_select" on storage.objects;
create policy "listing_photos_admin_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'listing-photos'
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  );

drop policy if exists "listing_photos_admin_delete" on storage.objects;
create policy "listing_photos_admin_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'listing-photos'
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  );
