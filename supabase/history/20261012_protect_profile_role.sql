-- ImmoCongo — only admins may change a profile's `role` or `verified`.
-- Before this, any signed-in user could make themselves admin (and so edit or delete every
-- listing through `listings_admin_all`), because the profiles policies only check
-- `auth.uid() = id`, not which columns change.
--
-- Compatible with both the old and the new site code: signup saves role 'user' (or no role),
-- and the admin's "Vérifier" button changes `verified` on other users' profiles.

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke execute on function public.protect_profile_privileges() from public, anon, authenticated;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges
  before insert or update on public.profiles
  for each row execute function public.protect_profile_privileges();
