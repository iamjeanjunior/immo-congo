# ImmoCongo — changelog

Newest first. Written for Junior: what changed for visitors and owners.

## 2026-10-12 — Trust fixes (live)
- **Real names only.** The owner's name on a listing and the name on a review now always come from the person's own account. Before, someone with technical knowledge could publish a listing or a review under another name (for example "Admin"). Now the database writes the real name itself, whatever the phone sends. When an admin edits someone's listing, the owner's name stays.
- **Name changes follow everywhere.** If a person changes their name, their listings, reviews and conversations show the new name too.
- **Honest view counts.** Only real visits of a listing page count. Before, an owner could set any number of "Vues" on their own listing.
- **Messages go to the right person.** A conversation is always with the real owner of the listing.
- **Fixed: "Utilisateur" instead of the real name.** A review or a conversation started very quickly after opening the page (on a slow connection) could be signed "Utilisateur". Now it always has the person's real name.
- **Admin: photo files are cleaned up.** When the admin deletes someone else's listing, or removes a photo from it, the photo files are now deleted too. Before, they stayed in the photo store.
- **"Mes annonces" when not logged in** now says "Connectez-vous pour voir vos annonces." with a "Se connecter" button, like Favoris and Messages. Before it said "Vous n'avez pas encore d'annonces.", which was confusing.
- The database rules are already switched on for the real site: they were checked with the current site first and change nothing for normal use. No existing listing, review or conversation had to be changed. The "Mes annonces" message goes live after Junior's yes.
- Automatic tests: 48 passed (9 new). The known problem from last time (admin photo files) is fixed.

## 2026-10-12 — Automatic tests (for developers, no change for visitors)
- Nothing changes on the website. This is a tool for Claude, so Junior no longer has to test everything by hand.
- Junior's laptop now has a private test copy of the website's database (it runs in Docker Desktop). It has the same tables and the same security rules as the real one, but only fake test accounts and fake listings. The real database and real accounts are never used by the tests.
- One command, `npm run test:e2e`, tests the site by itself in about 1–2 minutes, like a person would, on a phone-size screen and on a computer screen: creating an account, logging in and out, publishing a listing with 2 photos (and checking the photos are made smaller), the listing page with its photos, editing (removing a photo), deleting, an admin editing someone else's listing, an old account without a profile publishing, favourites, reviews, messages between two people (live), the admin "Vérifier" button, refusing a PDF instead of a photo, no page sliding sideways on a phone, what a visitor without an account sees, and the database security rules (for example, nobody can make themselves admin).
- Result of the first full run: 38 tests passed. 1 test shows a problem we already knew about: when an admin deletes someone else's listing, its photo files stay in the photo store.
- From now on, Claude runs these tests before every preview link. Junior only needs to look at how things look and feel on his phone.

## 2026-10-12 — Security: only admins can give the admin role or the verified badge (live)
- Before, a signed-in user with some technical knowledge could make themselves admin or "verified". Now the database refuses this unless the person asking is an admin. Nobody had used it. The admin "Vérifier" button works as before.

## 2026-10-12 — Fix: publishing without a profile, and admin edits (live)
- To publish, every account needs a "profile" (name and WhatsApp number). Some accounts had none, and they only saw "Erreur lors de la publication". Now, if the profile is missing when someone publishes, the site creates it by itself and publishes the listing. If that still fails, the person sees a clear French message that explains what to do, and the form keeps everything they typed.
- New accounts: the name and WhatsApp number are now also saved with the account itself. When this goes live, the database will use them to create the profile on its own, as soon as the account is made.
- Fixed: when an admin edited someone else's listing, the listing became the admin's (it showed the admin's name, and an empty WhatsApp field took the admin's number). Now the real owner stays, and an empty WhatsApp field keeps the listing's own number.
- The new error message stays on screen for 10 seconds, so there is time to read it.
- Tested on a test copy of the site (no real accounts were created): signing up, publishing with and without a profile, and an admin editing someone else's listing. Also checked at phone size.
- Junior tested it on an iPhone: the second account (which had no profile) could publish on the preview. Then it went live, and the database now creates the profile itself for every new account.

## 2026-10-12 — Fast photos (live)
- New photos are now made smaller on the phone before they are sent: a 2 MB phone photo becomes about 70–200 KB, with no visible loss on a phone screen. Pages with photos will load many times faster, even on a slow connection.
- Photos are now kept in Supabase Storage (a photo store) instead of inside the listing itself. The listing only keeps a link to each photo.
- Only real photos are accepted (JPG, PNG, WebP, and iPhone photos). A PDF, a video, a very big file (over 20 MB) or a broken file now gets a clear message in French.
- While publishing, the button shows "Préparation des photos…", then "Envoi des photos… 1/3", then "Enregistrement…".
- If the internet cuts during sending, nothing is saved halfway: the listing is not published, the form keeps everything, and you can simply try again.
- When you remove a photo from a listing, or delete a listing, its photo files are deleted too.
- Fixed: the first listing ("Maison 2 chambres") showed no photo on its own page. Editing it could also erase its photo. Both work now.
- Junior tested it on an iPhone on the preview, then it went live.
- The 5 photos of the 2 existing listings were moved to the photo store and shrunk (9.1 MB → 448 KB in total). The listings page now downloads 3 KB of listing data instead of 15.4 MB. The old photos are kept in a private backup for a few weeks, and the move can be undone.

## 2026-10-12 — New way of working
- New `ROADMAP.md`: the full plan in 4 phases (fast and good-looking → getting known → making money → international).
- From now on, every change first goes to a preview link. Junior checks it on a phone, and it goes live only after Junior says yes.
- No change for visitors.

## 2026-10-12 — Phone layout fixed
- The menu no longer covers the top of the page on phones. Before, the menu links were always open over the page; now they only show when you tap ☰, and they close when you pick a page.
- On tablets and phones turned sideways, logged-in users now get the ☰ menu too, instead of 7 squeezed links touching the logo.
- Long text (for example a Facebook link in a description, a review or a chat message) now wraps onto the next line instead of pushing the page sideways. This sideways push was what made the whole page shift and look overlapped on phones.
- Listing page: the green "Contacter sur WhatsApp" button now stays inside the white box (it was sticking out on the right). On phones the price sits under the title, and the info boxes (Ville, Chambres...) show 2 per row.
- Listings page: on phones the filters are now a tidy 2-column layout.
- Admin, Messages and Chat: rows and message bubbles stay inside the screen, even with long names or links.
- "Mes annonces": a little space between each listing and its Modifier / Supprimer buttons.
- Form fields use slightly bigger text on phones, so iPhones no longer zoom in when you tap a field.
- Checked every page at phone sizes (320, 360 and 375 px wide), tablet (768 px) and computer. Computer view looks the same as before.

## 2026-10-12
- Added a website maintainer agent for Claude (`.claude/agents/immocongo-maintainer.md`) and a project brief (`CLAUDE.md`).
- Big upgrade: real page links you can share, sort and price filters, "load more", loading animations, favorites (♥), star reviews, verified owner badge, view counter, map on each listing, similar listings, in-site messaging between renters and owners, and an admin panel.
- Database: added favorites, reviews, conversations and messages tables (`supabase_migration.sql`). Junior's account set as admin.
- Mobile menu (☰) and search bar on the listings page.
- Removed leftover template CSS that was squeezing the page layout.
