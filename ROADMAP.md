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
- [~] **Fast photos:** move photos out of the database into Supabase Storage (bucket `listing-photos`), shrink them on the phone before upload, accept only real image files. Today 3 listings = 15 MB, 23–35 seconds to load.
- [ ] **Browse without an account:** check that a visitor can see every listing and listing page without logging in; ask for login only to favourite, review, message or publish, with a clear French message explaining why.
- [ ] **Design refresh:** home page, listing cards and listing page look modern and trustworthy (good photos first, clear price, town and neighbourhood, verified owner badge).
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
- Report a fake or already-rented listing.
- Owner phone verification.
- Map view of all listings.
