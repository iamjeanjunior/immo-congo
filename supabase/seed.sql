-- ImmoCongo — test data for the LOCAL copy of Supabase only.
-- Loaded automatically by `npx supabase db reset` (and so by `npm run test:e2e`).
-- !! Never run this on production. !!
--
-- Test accounts (local test values, they only exist on this computer's test database).
-- The same values are in tests/e2e/helpers.js.
--   admin@example.com   / TestPass-2026!   "Admin Test"        role admin, verified
--   alice@example.com   / TestPass-2026!   "Alice Proprio"     normal user
--   bruno@example.com   / TestPass-2026!   "Bruno Sansprofil"  normal user WITHOUT a profile row
--                                                               (like old accounts: covers the
--                                                               "create the profile before publishing" path)

-- 1. Accounts -----------------------------------------------------------------------
-- The trigger on_auth_user_created creates each profile from raw_user_meta_data.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('TestPass-2026!', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('nom', u.nom, 'whatsapp', u.whatsapp), now(), now(),
  '', '', '', '', '', '', '', ''
from (values
  ('11111111-1111-4111-8111-111111111111'::uuid, 'admin@example.com', 'Admin Test', '+243 900 000 001'),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'alice@example.com', 'Alice Proprio', '+243 900 000 002'),
  ('33333333-3333-4333-8333-333333333333'::uuid, 'bruno@example.com', 'Bruno Sansprofil', '+243 900 000 003')
) as u(id, email, nom, whatsapp);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
  'email', now(), now(), now()
from auth.users u
where u.email in ('admin@example.com', 'alice@example.com', 'bruno@example.com');

-- 2. Profiles: make the admin, and remove Bruno's profile (he must have none) ---------
update public.profiles set role = 'admin', verified = true
where id = '11111111-1111-4111-8111-111111111111';

delete from public.profiles where id = '33333333-3333-4333-8333-333333333333';

-- 3. Listings (no photos: tests that need photos upload their own) -------------------
insert into public.listings (titre, prix, devise, localisation, ville, chambres, description, whatsapp, disponible, owner_id, owner_name, created_at)
values
  ('Maison 3 chambres – Gécamines', 800, 'USD', 'Quartier Gécamines, rue 12', 'Fungurume', 3,
   'Grande maison avec cour, eau et électricité. Proche de l''école.', '+243 900 000 001', true,
   '11111111-1111-4111-8111-111111111111', 'Admin Test', now() - interval '4 days'),
  ('Appartement meublé centre-ville', 1200, 'USD', 'Avenue Mzee, centre-ville', 'Lubumbashi', 2,
   'Appartement meublé au 2e étage, sécurisé, groupe électrogène.', '+243 900 000 002', true,
   '22222222-2222-4222-8222-222222222222', 'Alice Proprio', now() - interval '3 days'),
  ('Studio près du marché', 150, 'USD', 'Marché central', 'Fungurume', 1,
   'Petit studio simple, idéal pour une personne.', '+243 900 000 002', false,
   '22222222-2222-4222-8222-222222222222', 'Alice Proprio', now() - interval '2 days'),
  ('Villa avec jardin', 2500, 'USD', 'Quartier Joli Site', 'Kolwezi', 5,
   'Villa spacieuse avec jardin et garage pour deux voitures.', '+243 900 000 001', true,
   '11111111-1111-4111-8111-111111111111', 'Admin Test', now() - interval '1 day');

-- 4. One review --------------------------------------------------------------------------
insert into public.reviews (listing_id, user_id, reviewer_name, rating, comment)
select l.id, '22222222-2222-4222-8222-222222222222', 'Alice Proprio', 4, 'Belle maison, propriétaire sérieux.'
from public.listings l
where l.titre = 'Maison 3 chambres – Gécamines';
