# ImmoCongo — project brief for Claude

Rental listing platform for Fungurume (Katanga, DRC), expanding to other Congolese cities. Owner: Junior. UI language: French.

- Live site: https://immocongo-jandj.netlify.app
- GitHub: https://github.com/iamjeanjunior/immo-congo (branch `main`)
- Supabase project ref: `nnkrofhjhjyyprqhwbjv`

## Stack
- React 19 + Vite 8, single-page app. Almost everything is in `src/App.jsx` (inline style object `S`, hash routing via `parseRoute()` / `routeHash()` / `nav()`).
- Supabase: auth + Postgres. Client is created in `App.jsx` from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env`.
- Netlify auto-deploys every push to `main`. **Pushing = going live.**

## Database (public schema)
- `listings` — titre, prix, devise, localisation, ville, chambres, description, whatsapp, disponible, image_url, images (JSON string of base64 photos, max 6), owner_id, owner_name, views, created_at
- `profiles` — id (= auth user id), nom, whatsapp, role (`user` | `admin`), verified, created_at
- `favorites`, `reviews`, `conversations`, `messages` — see `supabase_migration.sql`
- RPC `increment_views(p_id)`; Realtime enabled on `messages`
- All schema changes go in a new file under `supabase/migrations/` (create the folder if missing) AND get applied to the database. Keep `supabase_migration.sql` as the historical baseline.

## Workflow
1. `npm install` (first time only)
2. Make the change
3. `npm run lint` — must be clean (0 errors)
4. `npm run build` — must succeed
5. Add an entry to `CHANGELOG.md`
6. `git add -A && git commit -m "<clear French or English message>" && git push`
7. Check the Netlify deploy finished, then check the live site

## Gotchas (learned the hard way)
- `.env` must never be committed (it's in `.gitignore`). On a new machine, recreate it by hand.
- Supabase URL in `.env` must NOT end with `/rest/v1/`.
- Supabase "Confirm email" is OFF on purpose — turning it on breaks signup (profile insert needs a session).
- The eslint config uses `react-hooks/set-state-in-effect`: don't call `setState` directly at the top level of a `useEffect`; call a named helper function instead (see `resetPagination`, `resetReviews`).
- Admin = `profiles.role = 'admin'`. Junior's real login account is the one whose profile row exists — check `profiles`, not just `auth.users` (there's a stray duplicate auth user with no profile).
- In the Claude desktop app's Linux sandbox: `vite build` can crash with "Bus error" (environment issue, not the code), git write commands can leave a stale `.git/index.lock`, and files can't be deleted. If that happens, tell Junior to run `rm -f .git/index.lock` in Git Bash. Prefer running git from Junior's own terminal/Claude Code on Windows.
- Junior types commands manually in Git Bash — when giving him commands, one per line, no leading `$`.

## Known issues / backlog (highest value first)
1. Mobile layout: elements overlap on small screens (reported by Junior). Check nav, filter bar, detail page action buttons, admin rows.
2. Photos are stored as base64 inside the `listings` row — slow and heavy. Move to Supabase Storage (bucket `listing-photos`) with client-side compression.
3. Split `App.jsx` (~1250 lines) into components/pages.
4. Unread-message badge on the Messages nav link.
5. Owner dashboard: views/favorites per listing.
6. Image compression before upload; enforce file type.
