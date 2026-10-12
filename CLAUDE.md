# ImmoCongo — project brief for Claude

Rental listing platform for Fungurume (Katanga, DRC), expanding to other Congolese cities. Owner: Junior. UI language: French.

- Live site: https://immocongo-jandj.netlify.app
- GitHub: https://github.com/iamjeanjunior/immo-congo (branch `main`)
- Supabase project ref: `nnkrofhjhjyyprqhwbjv`

## Stack
- React 19 + Vite 8, single-page app. Almost everything is in `src/App.jsx` (inline style object `S`, hash routing via `parseRoute()` / `routeHash()` / `nav()`).
- Look (design refresh, 2026-10): colours in the `C` object in `App.jsx` (navy `#0d2f6e` text/titles, green `#15803d` main buttons, white + light grey `#f5f7fa`). `src/index.css` holds what inline styles can't do (hover/focus states, animations, the hero drawing `src/assets/hero-katanga.svg`, the swipe gallery). System font stack, no web font. Icons: `src/Icon.jsx` (no emojis in buttons). Breakpoints: `isMobile` ≤640px, `isNarrow` ≤900px.
- **Never use `window.confirm()` / `alert()` / `prompt()`**: use `await askConfirm({ title, message, confirmLabel, danger })` (renders `src/ConfirmDialog.jsx`). The e2e `page` fixture fails any test where a native dialog opens.
- Supabase: auth + Postgres. Client is created in `App.jsx` from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env`.
- Netlify auto-deploys every push to `main`. **Pushing to `main` = going live.**
- Every other branch gets its own preview site at `https://<branch>--immocongo-jandj.netlify.app` (Netlify branch deploys). Previews and the live site share the same Supabase database.
- Automatic tests: Playwright (Chromium) against a local copy of Supabase in Docker. `npm run test:e2e`, see **Automatic tests** below.

## Database (public schema)
- `listings` — titre, prix, devise, localisation, ville, chambres, description, whatsapp, disponible, image_url (first photo), images (JSON string: array of photo URLs, max 6), owner_id (→ `profiles.id`), owner_name, views, created_at
- Photos: public Storage bucket `listing-photos`, files under `<owner uid>/` (users can only write their own folder). Shrunk on the device before upload (`src/photos.js`). Old rows could hold base64 data URLs; `listingPhotos()` in `src/photos.js` reads both formats. All existing rows were moved to Storage on 2026-10-12.
- `listing_photos_backup` — temporary private backup of the old base64 photos (RLS on, no policies). Undo SQL is in `supabase/one-off/20261012_photo_migration.sql`. Drop after 2026-11-09 if all is well.
- `profiles` — id (= auth user id), nom, whatsapp, role (`user` | `admin`), verified, created_at. A user without a profile row can't publish (foreign key on `listings.owner_id`).
  - Trigger `on_auth_user_created` (on `auth.users`) creates the profile at signup from `raw_user_meta_data` (nom, whatsapp); role is always `user`. The app then upserts nom/whatsapp, and creates a missing profile before publishing (`ensureProfile`). So the client must use upsert, never a plain insert.
  - Trigger `protect_profile_privileges` (on `profiles`): only an admin (or server-side code with no signed-in user) may set or change `role` / `verified`. Other users get error 42501.
- `favorites`, `reviews`, `conversations`, `messages` — buyer ↔ owner chat, favourites, star reviews
- RPC `increment_views(p_id)`; Realtime enabled on `messages`
- `exchange_rates` (migration `exchange_rates`, 2026-10-12) — base ('USD'), quote (CDF, EUR, ZAR, ZMW), rate (1 base = rate quote), source, source_updated_at, updated_at. Everyone can read it; nobody but the service role can write it.
  - Filled by the Edge Function `update-exchange-rate` (`supabase/functions/update-exchange-rate`, deployed through the connector with verify_jwt = false). It reads `https://open.er-api.com/v6/latest/USD` (ExchangeRate-API's open endpoint), refuses implausible rates, keeps the last good rate on any failure, and does nothing when the stored rate is less than 20 hours old.
  - Scheduled in production only with pg_cron + pg_net: jobs `update-exchange-rate` (01:30 UTC) and `update-exchange-rate-retry` (13:30 UTC), see `supabase/one-off/20261012_exchange_rate_schedule.sql`. Never schedule them locally (they call the production URL).
  - The site must show the source's attribution "Rates By Exchange Rate API" (footer, linked to exchangerate-api.com) wherever converted prices appear. Locally, `supabase/seed.sql` fixes the rates (1 USD = 2 500 CDF = 0.8 EUR = 18 ZAR = 25 ZMW).
  - In the app: display currency `currency` (saved in localStorage `immocongo.devise`, default USD), `fx` = rates or null. `priceInfo()` gives the shown price; filters and sorting compare converted prices. Without a rate the site shows the owners' prices and hides the currency button.
- **Trust triggers** (migration `trust_fixes`, live since 2026-10-12). They quietly overwrite what the client sends, never refuse, so old client code keeps working:
  - Names come from `profiles.nom`: `listings.owner_name` (follows `owner_id`, so an admin edit keeps the owner's name), `reviews.reviewer_name`, `conversations.buyer_name` / `owner_name`. No profile → "Utilisateur" (`owner_name` null for a listing without owner). Trigger `sync_profile_name` copies a profile name change to all of that person's rows. `messages` has no name column.
  - `conversations` (trigger `set_conversation_parties`): on insert, `owner_id` and `listing_title` are taken from the listing; a missing listing is refused.
  - `listings.views` (trigger `protect_listing_views`): requests running as `anon` / `authenticated` keep the old value (0 on insert). Only `increment_views` (SECURITY DEFINER, so inside it `current_user` = postgres) can change it. Keep `protect_listing_views` SECURITY INVOKER, or the check stops working.
- Storage: admins may also list and delete files in every folder of `listing-photos` (policies `listing_photos_admin_select` / `listing_photos_admin_delete`).
- The whole schema (tables, policies, functions, triggers, bucket, Realtime) as it was in production on 2026-10-12 is `supabase/migrations/20261012163000_baseline_from_production.sql`, read from production with read-only queries. **Never apply that file to production** (it already has all of it). Older hand-written SQL is kept only as history: `supabase_migration.sql`, `supabase/history/`, `supabase/one-off/` (the CLI never runs those folders).

## Database changes (migrations)
1. Create the file with the CLI, so it gets a 14-digit timestamp the CLI can order: `npx supabase migration new <short_name>` → `supabase/migrations/<YYYYMMDDHHMMSS>_<short_name>.sql`. Never hand-name files with an 8-digit date.
2. Write idempotent SQL (`if not exists`, `drop policy if exists`, `create or replace`). Always enable RLS on new tables. Update `supabase/seed.sql` if the test data needs the new columns.
3. Run it locally first: `npm run test:e2e` resets the local database with every migration + the seed, then runs the tests.
4. Apply it to production with the Supabase connector: `apply_migration` on project `nnkrofhjhjyyprqhwbjv`, with the same short name and the file's SQL. Production stores its own version number for it; that's fine.
   Then check both databases still have the same schema: `npm run db:fingerprint` (local) and the same file `scripts/e2e/schema-fingerprint.sql` through the connector's `execute_sql` (production, read-only). Every line must match. On 2026-10-12 all 13 lines matched (again after `trust_fixes`).
5. Never use `supabase link`, `supabase db push/pull/dump` or anything that needs Junior's database password or tokens. To compare with production, use read-only catalog queries through the connector.

## Workflow: preview first, live only after Junior says yes
What to work on: the first unchecked item of the current phase in `ROADMAP.md`, unless Junior asks for something else. Mark it `[~]` when you start and `[x] (date)` when it is live.

1. `npm install` (first time only)
2. Start from the latest `main` on a new short branch: `git switch main`, `git pull`, `git switch -c <short-name>` (lowercase and dashes only, e.g. `photo-storage`)
3. Make the change, and add or update the automatic test for it (`tests/e2e/`). `npm run lint` must show 0 errors and `npm run build` must succeed.
4. `npm run test:e2e` must pass before you push (Docker Desktop must be running). "Known bugs" marked expected-to-fail are allowed; anything listed under "Failed" is not.
5. Add an entry to `CHANGELOG.md` (plain language, what changed for visitors and owners)
6. Commit and `git push -u origin <short-name>`
7. Wait for the Netlify deploy of that branch, then check the preview at `https://<short-name>--immocongo-jandj.netlify.app` at phone width (375px) and desktop
8. **Stop.** Send Junior the preview link, the test result (for example "52 automatic tests passed"), and a short, simple checklist. The checklist only covers what the automatic tests can't check: how it looks and feels on his real phone (and real photos from his gallery, real WhatsApp links). Don't ask Junior to re-test signup, login, publishing etc. by hand: the tests do that. Don't merge until Junior says yes in the chat.
9. After Junior's yes: `git switch main`, `git pull`, `git merge --no-ff <short-name>`, `git push`. Then delete the branch (`git branch -d <short-name>`, `git push origin --delete <short-name>`), check the Netlify production deploy finished and the live site works, and tick the item in `ROADMAP.md`.

Exceptions:
- **Docs only** (`CLAUDE.md`, `ROADMAP.md`, agent files, no code): commit straight to `main` with `[skip netlify]` in the commit message, so no site rebuild happens.
- **Live site broken:** revert straight on `main` (`git revert <commit>`, `git push`), confirm the site is back, then tell Junior.

Database changes (previews use the live database!):
- Before Junior's yes, only make **additive** changes the live site can live with: new tables, columns, buckets, policies, functions.
- Renaming or dropping anything, or rewriting existing rows, waits until the code that needs it is live. Back up data before rewriting it, and ask Junior before deleting real data.

## Automatic tests
- **One command:** `npm run test:e2e` (Docker Desktop must be running). It starts the local Supabase if needed, resets it (all migrations + `supabase/seed.sql`), builds the site against it, runs every test in Chromium, and prints a summary (passed / failed / known bugs). A full run takes about 1–2 minutes (about 1 min 15 s when the local Supabase is already running, about 2 min when it has to start). The very first run on a computer also downloads the local Supabase (about 4 GB of Docker images, about 15 minutes on Junior's connection).
- **Safety:** the scripts refuse to run unless Supabase is on `localhost` / `127.0.0.1`. The production `.env` is never read for the test build (Vite reads env files from an empty folder), the built test site is checked for the production project ref, and test browsers block every request that doesn't go to this computer (so also Google Maps and Google Fonts; the map is empty in test screenshots).
- **Test accounts** exist only in the local database: see `supabase/seed.sql` (admin, Alice, Bruno without a profile, a few listings) and `tests/e2e/helpers.js`. Most tests create their own fresh accounts with `createUser()`, so they can run in parallel. Never use real accounts, and never create test accounts on the live site.
- **Where:** `tests/e2e/*.spec.js`, one file per area (auth, listings, social, admin, layout, visitor, security). Every browser test runs at phone size (375px, project `phone`); tests whose title contains `@desktop` also run at 1280px (project `desktop`). `security.spec.js` checks the database rules straight through supabase-js (project `api`). Photos for tests are in `tests/e2e/fixtures/`.
- **Useful:** `npm run test:e2e -- -g "favoris"` (only matching tests), `npm run test:e2e -- --project=phone`, `npm run test:e2e -- --no-reset` (keep the local data), `npm run test:e2e:report` (screenshots and traces of failures), `npm run supabase:stop` (frees the memory Docker uses; the next run starts it again). Tests run 2 browsers at a time; `E2E_WORKERS=4 npm run test:e2e` is faster when the laptop has free memory (with too little memory Chrome fails with `net::ERR_INSUFFICIENT_RESOURCES`).
- A real bug found by a test that isn't fixed in the same branch: mark the test `test.fail(true, "BUG: ...")` with a clear note (it shows under "Known bugs" in the summary), and add the bug to `ROADMAP.md`. Never delete or weaken a test to make it pass.
- Local services the site doesn't use (Studio, email testing, analytics, Edge Functions...) are switched off in `supabase/config.toml`.

## Gotchas (learned the hard way)
- `.env` must never be committed (it's in `.gitignore`). On a new machine, recreate it by hand.
- Supabase URL in `.env` must NOT end with `/rest/v1/`.
- Supabase "Confirm email" is OFF on purpose — turning it on breaks signup (profile insert needs a session).
- The eslint config uses `react-hooks/set-state-in-effect`: don't call `setState` directly at the top level of a `useEffect`; call a named helper function instead (see `resetPagination`, `resetReviews`).
- Admin = `profiles.role = 'admin'`. Junior's real login account is the one whose profile row exists — check `profiles`, not just `auth.users` (there's a stray duplicate auth user with no profile).
- In the Claude desktop app's Linux sandbox: `vite build` can crash with "Bus error" (environment issue, not the code), git write commands can leave a stale `.git/index.lock`, and files can't be deleted. If that happens, tell Junior to run `rm -f .git/index.lock` in Git Bash. Prefer running git from Junior's own terminal/Claude Code on Windows.
- Junior types commands manually in Git Bash — when giving him commands, one per line, no leading `$`.
- The GitHub CLI (`gh`) is not installed on Junior's laptop, so we use Netlify branch previews instead of pull requests.
- Docker Desktop on Junior's laptop is installed per-user: `docker.exe` is in `%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin` and is often **not on PATH** in Claude's shells. Without it `docker-credential-desktop` is not found and `npx supabase start` fails. `npm run test:e2e` adds it by itself; for manual commands in Git Bash, first run `export PATH="$LOCALAPPDATA/Programs/DockerDesktop/resources/bin:$PATH"`.
- The local Supabase listens on ports 443xx (API `http://127.0.0.1:44321`, database 44322), not the usual 543xx: Windows (Hyper-V) reserves port ranges around 54000 on Junior's laptop (`netsh interface ipv4 show excludedportrange protocol=tcp`), and Docker then fails with "access permissions". The test site itself is on `http://127.0.0.1:4399`.
- The local Supabase uses Postgres 17 like production, but a slightly newer minor version (local 17.11, production 17.6). Auth, Storage and Realtime are also the CLI's versions, not production's.

## Plan and backlog
See `ROADMAP.md` (phases, priorities, what's done).
