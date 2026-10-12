# ImmoCongo — roadmap

The plan for the website, highest priority first. Junior and Claude plan here together; the maintainer agent always takes the **first unchecked item** of the current phase.

- `[ ]` to do · `[~]` in progress · `[x]` done (with date)
- 🧑 = a task for Junior (not code)
- New ideas go in **Ideas / later** at the bottom until we decide where they fit.

## How we work
1. **Plan:** Junior and Claude agree on the next items in this file.
2. **Build:** the maintainer agent does one item at a time, on its own branch.
3. **Preview:** the agent sends Junior a preview link (`https://<branch>--immocongo-jandj.netlify.app`). Nothing changes on the live site yet.
4. **Approve:** Junior checks the preview on a phone and says yes (or asks for changes).
5. **Go live:** only after Junior's yes, the change is merged into `main` and goes live.
6. **Health check:** every week an automatic check opens the live site and reports anything broken. Problems found go into this file.

## Vision
The best real-estate website, starting in Fungurume and Katanga, then all of DR Congo, then other countries. Anyone can browse without an account: pick a country, region, town and neighbourhood and see houses and business premises for rent or for sale. An account is only needed to save favourites, comment, contact owners or publish.

---

## Phase 1 — Fast, good-looking, works well (now)
- [x] Phone layout: nothing overlaps on small screens (2026-10-12)
- [x] **Fast photos:** photos moved out of the database into Supabase Storage (bucket `listing-photos`), shrunk on the phone before upload, only real image files accepted. Listings data went from 15.4 MB to 3 KB. (2026-10-12)
- [x] **Fix: accounts without a profile can't publish.** The app now creates a missing profile before publishing (clear French message if it still fails), and the database creates the profile on signup (trigger `on_auth_user_created`). (2026-10-12)
- [x] **Fix: an admin editing someone else's listing becomes its owner.** Editing no longer sends `owner_id` / `owner_name`. (2026-10-12)
- [x] **Security: only admins can change a profile's role or verified badge** (trigger `protect_profile_privileges`). (2026-10-12)
- [x] **Automatic testing, so Junior rarely has to test by hand.** Local copy of Supabase (Supabase CLI + Docker Desktop) with test accounts, and 39 automatic browser and database tests; run with `npm run test:e2e` before every preview. (2026-10-12)
- [x] **Trust fixes:** names on listings, reviews and conversations come from the author's profile; only `increment_views` changes view counts; conversations only with a listing's real owner; admin can delete other users' photo files; "Mes annonces" asks visitors to log in. (2026-10-12)
- [~] **Design refresh** (Junior's choices, 2026-10-12; preview `design-refresh`, waiting for Junior's yes): **clean & airy** style like Airbnb (white background, big photos, rounded cards, lots of space); **keep the navy + green** colours and logo; home page opens with a **big search bar** (town, price, rooms) over a nice photo. Covers the whole site: home, listing cards, listing page, forms, menus, messages, admin. Replace the browser's own pop-ups (`confirm()` / `alert()`, e.g. "Supprimer cette annonce ?" with English OK/Cancel) with a clean French dialog that matches the site.
- [ ] Update outdated developer packages (`npm audit` reports 6 issues in vite / eslint dependencies; not visible to visitors).
- [ ] **Browse without an account:** check that a visitor can see every listing and listing page without logging in; ask for login only to favourite, review, message or publish, with a clear French message explaining why.
- [ ] **Split `src/App.jsx`** (~1,260 lines) into smaller files (pages and components). Needed before several agents can work on the code at the same time.
- [ ] **Listing type fields (cheap now, painful later):** add "for rent / for sale" and a category (house, apartment, room, business premises, land) to listings, with filters.
- [ ] Unread-message badge on the Messages link.
- [ ] Owner dashboard: views and favourites for each of my listings.

## Phase 2 — Getting known
- [ ] **Real page addresses** instead of `#/` links (for example `/annonce/12`). Needed for Google and for link previews.
- [ ] **Link previews on WhatsApp and Facebook:** a shared listing shows its photo, price and town.
- [ ] "Partager sur WhatsApp" button on every listing.
- [ ] Google basics: page titles and descriptions, sitemap, Google Search Console.
- [ ] Installable on the phone home screen like an app (PWA), works on slow connections.
- [ ] 🧑 Buy our own domain (for example `immocongo.com` or `.cd`); Claude connects it to Netlify.
- [ ] 🧑 Bring landlords on board: free listings, help them post (or post for them) in Fungurume first.
- [ ] 🧑 Facebook page and WhatsApp groups to share new listings.

## Phase 3 — Making money
Start charging only once there are enough listings and visitors. Prices to decide later.
- [ ] Free listing limit per account (for example 3); pay to publish more.
- [ ] "À la une" boosted listings, shown first in results.
- [ ] Agency / professional accounts with a monthly subscription.
- [ ] Mobile money payments (M-Pesa, Orange Money, Airtel Money): research which payment provider works in DR Congo.
- [ ] Ads, once traffic is high enough to be worth it.

## Phase 4 — International platform
- [ ] Locations: country → region/province → town → neighbourhood (search and filters for each level).
- [ ] Rent and sale for homes, business premises and land everywhere.
- [ ] Several currencies and languages (French first, then English).
- [ ] Decide whether to move to a framework with server rendering (better for Google at scale).

---

## Ideas / later
- 🧑 Home page picture: today it is a light drawing of houses at dusk. If Junior takes a nice photo of Fungurume himself (his own, so we have the rights), Claude can use it instead, shrunk to a WebP under 150 KB.
- 🧑 Decide what to do with Junior's second login account (no profile): delete it, or give it a profile.
- 🧑 One live listing shows its owner as "Utilisateur" (that account's profile name is "Utilisateur"). Tell Claude the right name: fixing the profile updates the listing by itself.
- "Mon profil" page to change one's name and WhatsApp number (the name then follows on listings, reviews and conversations automatically).
- Photos an admin adds while editing someone else's listing go into the admin's photo folder, so the owner can't delete those files later (they stay in Storage).
- View counter: every page opening counts (reloading pushes it up). Count one view per visitor per day.
- 🧑 Delete the leftover "migrate-listing-photos" Edge Function in the Supabase dashboard (it's already switched off).
- After 2026-11-09, if all is well: drop the temporary table `listing_photos_backup` (backup of the old photos).
- Report a fake or already-rented listing.
- Owner phone verification.
- Map view of all listings.
