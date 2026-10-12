// Phone layout: no page may scroll sideways at 375px (the "elements overlap" problem from before).
// Runs in the "phone" project only (not tagged @desktop).
import { test, expect, open, login, openMenu, createUser, createListing, clientAs, expectNoSideScroll, SEED } from "./helpers.js";

const LONG_LINK = "https://www.facebook.com/groups/immobilier.fungurume.kolwezi.lubumbashi/permalink/123456789012345678901234567890";

test("pas de défilement horizontal à 375px sur les pages principales", async ({ page }) => {
  // Data with long text that must wrap (a long link in a description, a review and a chat message).
  const owner = await createUser({ nom: "Propriétaire-avec-un-nom-très-très-long-pour-tester" });
  const buyer = await createUser();
  const listing = await createListing(owner, {
    photos: ["photo-1.png", "photo-2.jpg"],
    titre: `Maison-de-test-avec-un-titre-extrêmement-long-sans-espaces-${Date.now()}`,
    description: `Voir les photos ici : ${LONG_LINK}`,
  });
  const client = await clientAs(buyer);
  await client.from("reviews").insert({ listing_id: listing.id, user_id: buyer.id, reviewer_name: buyer.nom, rating: 5, comment: LONG_LINK });
  await client.from("favorites").insert({ user_id: buyer.id, listing_id: listing.id });
  const { data: conv, error } = await client.from("conversations").insert({
    listing_id: listing.id, listing_title: listing.titre, buyer_id: buyer.id, buyer_name: buyer.nom, owner_id: owner.id, owner_name: owner.nom,
  }).select().single();
  expect(error).toBeNull();
  await client.from("messages").insert({ conversation_id: conv.id, sender_id: buyer.id, content: LONG_LINK });

  // Visitor pages.
  for (const route of ["", "listings", `listing/${listing.id}`, "auth"]) {
    await open(page, route);
    await expect(page.locator("nav")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectNoSideScroll(page, `visitor #/${route}`);
  }
  await openMenu(page);
  await expectNoSideScroll(page, "visitor menu open");

  // Logged-in pages.
  await login(page, buyer);
  for (const [route, ready] of [
    ["", "Annonces récentes"],
    ["listings", "🔍 Filtres"],
    [`listing/${listing.id}`, "Description"],
    ["post", "Photos de la maison (max 6)"],
    ["my-listings", "Vous n'avez pas encore d'annonces."],
    ["favorites", "♥ Mes favoris"],
    ["messages", `À propos de : ${listing.titre}`],
    [`chat/${conv.id}`, LONG_LINK],
  ]) {
    await open(page, route);
    await expect(page.getByText(ready, { exact: true }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectNoSideScroll(page, `logged in #/${route}`);
  }
  await openMenu(page);
  await expectNoSideScroll(page, "logged-in menu open");

  // Owner and admin pages.
  await login(page, owner);
  await open(page, "my-listings");
  await expect(page.getByRole("button", { name: "✏️ Modifier" })).toBeVisible();
  await expectNoSideScroll(page, "owner #/my-listings");
  await page.getByRole("button", { name: "✏️ Modifier" }).click();
  await expect(page.locator("form img")).toHaveCount(2);
  await expectNoSideScroll(page, "owner edit form with photos");

  await login(page, SEED.admin);
  await open(page, "admin");
  for (const tab of [/^Annonces \(\d+\)$/, /^Utilisateurs \(\d+\)$/, /^Avis \(\d+\)$/]) {
    await page.getByRole("button", { name: tab }).click();
    await expectNoSideScroll(page, `admin tab ${tab}`);
  }
});
