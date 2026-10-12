# ImmoCongo — changelog

Newest first. Written for Junior: what changed for visitors and owners.

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
