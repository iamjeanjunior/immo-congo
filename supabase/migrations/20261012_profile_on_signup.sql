-- ImmoCongo — Every new account gets its profile automatically.
-- Safe to re-run (create or replace / drop trigger if exists).
--
-- Why: listings.owner_id must point to a row in public.profiles
-- (listings_owner_id_fkey). Until now only the app created that row, right after
-- signup. If that failed, the account could never publish.
-- Now the database creates the row as soon as the account is created, with the
-- name and WhatsApp number the signup form sends (raw_user_meta_data). The app
-- then saves them again with an upsert, so it works with or without this trigger.
--
-- ORDER: apply this AFTER the app code from branch `fix-profile-owner` is live.
-- The older app code does a plain insert after signup and ignores errors: with
-- this trigger its insert would fail silently and the new user would be saved
-- as "Utilisateur" with no WhatsApp number.
--
-- Security:
-- - role is always 'user'; it is never taken from the signup data (the user
--   controls that data).
-- - security definer with an empty search_path; nobody can call the function
--   directly through the API.
-- - Any error is only logged as a warning, so a problem here can never stop
--   someone from creating an account. (If the profile is still missing, the app
--   creates it before publishing.)
--
-- Existing accounts are NOT backfilled on purpose.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
