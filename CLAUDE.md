# ImmoCongo — project brief for Claude

Rental listing platform for Fungurume (Katanga, DRC), expanding to other Congolese cities. Owner: Junior. UI language: French.

- Live site: https://immocongo-jandj.netlify.app
- GitHub: https://github.com/iamjeanjunior/immo-congo (branch `main`)
- Supabase project ref: `nnkrofhjhjyyprqhwbjv`

## Stack
- React 19 + Vite 8, single-page app. Almost everything is in `src/App.jsx` (inline style object `S`, hash routing via `parseRoute()` / `routeHash()` / `nav()`).
- Supabase: auth + Postgres. Client is created in `App.jsx` from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env`.
- Netlify auto-deploys every push to `main`. **Pushing to `main` = going live.**
- Every other branch gets its own preview site at `https://<branch>--immocongo-jandj.netlify.app` (Netlify branch deploys). Previews and the live site share the same Supabase database.

## Database (public schema)
- `listings` — titre, prix, devise, localisation, ville, chambres, description, whatsapp, disponible, image_url (first photo), images (JSON string: array of photo URLs, max 6), owner_id (→ `profiles.id`), owner_name, views, created_at
- Photos: public Storage bucket `listing-photos`, files under `<owner uid>/` (users can only write their own folder). Shrunk on the device before upload (`src/photos.js`). Old rows could hold base64 data URLs; `listingPhotos()` in `src/photos.js` reads both formats. All existing rows were moved to Storage on 2026-10-12.
- `listing_photos_backup` — temporary private backup of the old base64 photos (RLS on, no policies). Undo SQL is in `supabase/one-off/20261012_photo_migration.sql`. Drop after 2026-11-09 if all is well.
- `profiles` — id (= auth user id), nom, whatsapp, role (`user` | `admin`), verified, created_at. A user without a profile row can't publish (foreign key on `listings.owner_id`).
- `favorites`, `reviews`, `conversations`, `messages` — see `supabase_migration.sql`
- RPC `increment_views(p_id)`; Realtime enabled on `messages`
- All schema changes go in a new file under `supabase/migrations/` (create the folder if missing) AND get applied to the database. Keep `supabase_migration.sql` as the historical baseline.

## Workflow: preview first, live only after Junior says yes
What to work on: the first unchecked item of the current phase in `ROADMAP.md`, unless Junior asks for something else. Mark it `[~]` when you start and `[x] (date)` when it is live.

1. `npm install` (first time only)
2. Start from the latest `main` on a new short branch: `git switch main`, `git pull`, `git switch -c <short-name>` (lowercase and dashes only, e.g. `photo-storage`)
3. Make the change. `npm run lint` must show 0 errors and `npm run build` must succeed.
4. Add an entry to `CHANGELOG.md` (plain language, what changed for visitors and owners)
5. Commit and `git push -u origin <short-name>`
6. Wait for the Netlify deploy of that branch, then check the preview at `https://<short-name>--immocongo-jandj.netlify.app` at phone width (375px) and desktop
7. **Stop.** Send Junior the preview link and a short, simple explanation of what to look at. Don't merge until Junior says yes in the chat.
8. After Junior's yes: `git switch main`, `git pull`, `git merge --no-ff <short-name>`, `git push`. Then delete the branch (`git branch -d <short-name>`, `git push origin --delete <short-name>`), check the Netlify production deploy finished and the live site works, and tick the item in `ROADMAP.md`.

Exceptions:
- **Docs only** (`CLAUDE.md`, `ROADMAP.md`, agent files, no code): commit straight to `main` with `[skip netlify]` in the commit message, so no site rebuild happens.
- **Live site broken:** revert straight on `main` (`git revert <commit>`, `git push`), confirm the site is back, then tell Junior.

Database changes (previews use the live database!):
- Before Junior's yes, only make **additive** changes the live site can live with: new tables, columns, buckets, policies, functions.
- Renaming or dropping anything, or rewriting existing rows, waits until the code that needs it is live. Back up data before rewriting it, and ask Junior before deleting real data.

## Gotchas (learned the hard way)
- `.env` must never be committed (it's in `.gitignore`). On a new machine, recreate it by hand.
- Supabase URL in `.env` must NOT end with `/rest/v1/`.
- Supabase "Confirm email" is OFF on purpose — turning it on breaks signup (profile insert needs a session).
- The eslint config uses `react-hooks/set-state-in-effect`: don't call `setState` directly at the top level of a `useEffect`; call a named helper function instead (see `resetPagination`, `resetReviews`).
- Admin = `profiles.role = 'admin'`. Junior's real login account is the one whose profile row exists — check `profiles`, not just `auth.users` (there's a stray duplicate auth user with no profile).
- In the Claude desktop app's Linux sandbox: `vite build` can crash with "Bus error" (environment issue, not the code), git write commands can leave a stale `.git/index.lock`, and files can't be deleted. If that happens, tell Junior to run `rm -f .git/index.lock` in Git Bash. Prefer running git from Junior's own terminal/Claude Code on Windows.
- Junior types commands manually in Git Bash — when giving him commands, one per line, no leading `$`.
- The GitHub CLI (`gh`) is not installed on Junior's laptop, so we use Netlify branch previews instead of pull requests.

## Plan and backlog
See `ROADMAP.md` (phases, priorities, what's done).
