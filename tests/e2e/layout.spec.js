// Phone layout: no page may scroll sideways at 375px (the "elements overlap" problem from before).
// Runs in the "phone" project only (not tagged @desktop).
import { test, expect, open, login, openMenu, openFilters, createUser, createListing, clientAs, expectNoSideScroll, confirmDialog, SEED } from "./helpers.js";

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
  for (const route of ["", "listings", `listing/${listing.id}`, "auth", "my-listings"]) {
    await open(page, route);
    await expect(page.locator("nav")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectNoSideScroll(page, `visitor #/${route}`);
  }
  await openMenu(page);
  await expectNoSideScroll(page, "visitor menu open");
  await open(page, "listings");
  await openFilters(page);
  await expect(page.getByLabel("Prix max en USD")).toBeVisible();
  await expectNoSideScroll(page, "listings filters open");

  // Logged-in pages.
  await login(page, buyer);
  for (const [route, ready] of [
    ["", "Annonces récentes"],
    ["listings", "Maisons et appartements à louer au Katanga"],
    [`listing/${listing.id}`, "Description"],
    ["post", "Photos de la maison (max 6)"],
    ["my-listings", "Vous n'avez pas encore d'annonces."],
    ["favorites", "Mes favoris"],
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
  await expect(page.getByRole("button", { name: "Modifier", exact: true })).toBeVisible();
  await expectNoSideScroll(page, "owner #/my-listings");

  // The confirmation window fits on the phone screen.
  await page.getByRole("button", { name: "Supprimer", exact: true }).click();
  const dialog = confirmDialog(page);
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box.x, "dialog inside the screen (left)").toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, "dialog inside the screen (right)").toBeLessThanOrEqual(375);
  for (const name of ["Annuler", "Supprimer"]) {
    const button = (await dialog.getByRole("button", { name, exact: true }).boundingBox());
    expect(button.height, `"${name}" is easy to tap`).toBeGreaterThanOrEqual(44);
  }
  await expectNoSideScroll(page, "delete confirmation open");
  await dialog.getByRole("button", { name: "Annuler" }).click();

  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  await expect(page.locator("form img")).toHaveCount(2);
  await expectNoSideScroll(page, "owner edit form with photos");

  await login(page, SEED.admin);
  await open(page, "admin");
  for (const tab of [/^Annonces \(\d+\)$/, /^Utilisateurs \(\d+\)$/, /^Avis \(\d+\)$/]) {
    await page.getByRole("button", { name: tab }).click();
    await expectNoSideScroll(page, `admin tab ${tab}`);
  }
});

test("formulaires : champs en 16 px et boutons faciles à toucher (44 px ou plus)", async ({ page }) => {
  const user = await createUser();
  // 16px stops iPhones from zooming in when a field is tapped.
  await open(page, "auth");
  for (const field of await page.locator("form input").all()) {
    expect(await field.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  }
  const submit = await page.locator("form").getByRole("button", { name: "Se connecter" }).boundingBox();
  expect(submit.height).toBeGreaterThanOrEqual(44);

  await login(page, user);
  await open(page, "post");
  const fields = page.locator("form input:not([type=file]), form select, form textarea");
  expect(await fields.count()).toBeGreaterThanOrEqual(9);
  for (const field of await fields.all()) {
    const { size, height } = await field.evaluate(el => ({ size: parseFloat(getComputedStyle(el).fontSize), height: el.getBoundingClientRect().height }));
    expect(size).toBeGreaterThanOrEqual(16);
    expect(height).toBeGreaterThanOrEqual(44);
  }
  const publish = await page.getByRole("button", { name: "Publier l'annonce" }).boundingBox();
  expect(publish.height).toBeGreaterThanOrEqual(44);
});
