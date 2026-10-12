# ImmoCongo — changelog

Newest first. Written for Junior: what changed for visitors and owners.

## 2026-10-12 — Found on Google, nice previews on WhatsApp (live)
- **Real page addresses.** Pages now have short, readable French addresses instead of "#/": for example `/annonces`, `/annonce/12-maison-2-chambres-fungurume`, `/connexion`, `/publier`, `/favoris`, `/messages`, `/mes-annonces`. Google can only list pages that have their own address, so this was needed first.
- **Old links still work.** Links people already shared (with "#/") open the right page and the address changes to the new one by itself. Reloading a page, and the phone's back and forward buttons, work as before.
- **Link previews on WhatsApp and Facebook.** When someone shares a listing, the message now shows the first photo, the title, the price per month, the town and the number of rooms. The home page and the listings page show a picture with the ImmoCongo logo and "Maisons à louer au Katanga".
- **The "Partager" button** on a listing now shares the new address.
- **Google basics.** Every page has its own title and description in French (for example "Maison 3 chambres – Fungurume | ImmoCongo"). Google gets a list of all available listings (`/sitemap.xml`, updated by itself) and a `/robots.txt` file. Members-only pages (login, publish, favourites, messages, my listings, admin) are kept out of Google. Each listing also tells Google in its own language that it is a rental, with its price, town and rooms.
- On a slow connection, a listing page now shows its title, price and description as simple text while the site is still loading, instead of a white page. The rest of the site looks exactly the same.
- A listing that was deleted now tells Google "this page doesn't exist any more", so it disappears from Google.
- Nothing changes in the database.
- Automatic tests: 77 passed (16 new: the new addresses, old "#/" links, reloading a page, back and forward, titles and descriptions, members-only pages kept out of Google, and the link previews and sitemap checked with fake data).

## 2026-10-12 — Design refresh (live)
- **A new, cleaner look for the whole site**, in the "clean & airy" style Junior chose: white pages, big photos, rounded corners, lots of space. The navy + green colours and the Immo**Congo** logo stay: navy for titles and text, green for the main buttons.
- **Home page:** it now opens with a big search over a drawing of Katanga houses at dusk. You choose the town, the maximum price and the number of rooms, tap "Rechercher", and you land directly on the matching listings. Below: the latest listings, "Comment ça marche ?" in 3 steps, an invitation for landlords to publish for free, and a footer with the WhatsApp contact (now on every page).
- The home page drawing is very light (about 3 KB, no photo to download), so it shows fast even on slow connections.
- **Listing cards:** the photo comes first (same shape for all), the price is big, then the title, town and neighbourhood, rooms, and a green "Vérifié" badge when the owner is verified. The heart (favourite) is on the photo. Photos load only when you scroll to them.
- **Listing page:** on phones you swipe from photo to photo (with "1 / 3"); on computers there are arrows and small photos underneath. The information (town, rooms, date, photos, views) is in a tidy grid, and the owner has a card with the "Propriétaire vérifié" badge. On phones, a bar stays at the bottom of the screen with **WhatsApp** and **Message**, so contacting the owner is always one tap away. On computers, the price and contact buttons stay on the right while you scroll.
- **Listings page:** a search box and clear filters with their names (town, rooms, status, sort, price). On phones the filters fold away behind a "Filtres" button, so the listings show sooner. New: a "Chambres" filter (1 or more, 2 or more...) and an "Effacer les filtres" button.
- **Forms** (publish, login, signup): every field has its name above it, bigger fields and buttons that are easy to tap. The publish form is in 3 parts (the house, photos, contact) with a big "Ajouter des photos" box. Login and signup errors now show in red inside the form, in French (for example "Un compte existe déjà avec cet email. Connectez-vous." instead of an English message).
- **Menu, favourites, Mes annonces, messages, chat and admin** have the same look. The chat shows who you are talking to and the time of each message, and it scrolls to the newest message by itself.
- **No more grey browser pop-up.** Deleting a listing (or, for the admin, a review) now asks in the site's own window, in French: "Supprimer cette annonce ?" with "Annuler" and a red "Supprimer" button. Tapping outside the window or pressing Esc cancels.
- Emojis in buttons and menus were replaced by simple drawn icons that look the same on every phone. The browser tab shows a small ImmoCongo house icon instead of the old purple one.
- **Prices in your currency (like Booking.com).** A small button at the top ("$ USD") opens a list of currencies: USD and CDF first, then EUR, ZAR and ZMW. Tap one and every price on the site changes at once, without reloading: cards, home, listings and the bar at the bottom of the phone. Prices are rounded so they read well ("70 $", "200 000 FC"). The phone remembers the choice; the first time it is USD.
- On a listing page, one small line shows the price the owner set when it is in another currency, for example "Prix fixé par le propriétaire : 200 000 FC". Owners still publish in their own currency (USD, CDF or ZAR); nothing is converted in the listing itself.
- The maximum price in the search and the price filters work in the chosen currency (its symbol is inside the field), and "Prix croissant / décroissant" compares the converted prices. Before, 200 000 CDF counted as more expensive than 500 USD.
- **The day's exchange rate** comes from ExchangeRate-API (free). Our database fetches it by itself every night at 03:30 (Lubumbashi time), with a second try at 15:30 if the first one failed, and keeps it; visitors' phones only ask our own database. The footer says "Prix convertis au taux du jour (1 USD = 2 315 FC, mis à jour le …)" and names the source, as its rules require. If the rate can't be updated, the last one stays; if there is no rate at all, the site simply shows the owners' prices and hides the currency button.
- First rate, 12 October 2026: 1 USD = 2 314.68 CDF (also 0.89 EUR, 16.51 ZAR, 20.15 ZMW).
- **Removed** the strip with the number of listings, towns and verified owners on the home page (Junior's feedback).
- **Faster:** the site no longer downloads a special font from Google; phones use their own system font (on iPhone, Apple's font). Prices are written the French way (1 200).
- Also checked on tablets (768 px): the listing page goes into one column there.
- Database: one new table with the exchange rates (everyone can read it, only the server can change it), a small server program that updates it, and the nightly schedule. These are additions: the live site ignores them, and listings, accounts, messages and favourites work as before.
- Automatic tests: 61 passed (13 new: the delete window, the home search, French signup errors, field and button sizes on phones, and for the currencies: instant switch, remembered choice, rounding, price filter and sorting across USD and CDF, publishing in CDF, the case without a rate, and the rule that nobody can change the rate). The tests now also fail if the browser's own pop-up ever opens again.

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
