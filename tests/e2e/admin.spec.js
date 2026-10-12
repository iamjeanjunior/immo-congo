// Admin panel: "Vérifier" badge, deleting a review, access for non-admins.
import { test, expect, open, login, clickNav, createUser, createListing, clientAs, getProfile, db, SEED } from "./helpers.js";

// The admin row (white box) that holds `text` and some buttons.
const adminRow = (page, text) => page.locator("div").filter({ hasText: text }).filter({ has: page.getByRole("button") }).last();

test("admin : le bouton Vérifier donne puis retire le badge vérifié @desktop", async ({ page }) => {
  const target = await createUser();
  const listing = await createListing(target);

  await login(page, SEED.admin);
  await clickNav(page, "⚙️ Admin");
  await page.getByRole("button", { name: /^Utilisateurs \(\d+\)$/ }).click();
  const row = adminRow(page, target.nom);
  await expect(row).toBeVisible();
  await expect(row.getByText("✔️ Vérifié")).toHaveCount(0);

  await row.getByRole("button", { name: "Vérifier" }).click();
  await expect(page.getByText("Statut mis à jour.")).toBeVisible();
  await expect(row.getByText("✔️ Vérifié")).toBeVisible();
  await expect.poll(async () => (await getProfile(target.id)).verified).toBe(true);

  // The badge shows next to the owner's name on their listing.
  await open(page, `listing/${listing.id}`);
  await expect(page.getByText(`${target.nom} ✔️`)).toBeVisible();

  await clickNav(page, "⚙️ Admin");
  await page.getByRole("button", { name: /^Utilisateurs \(\d+\)$/ }).click();
  await adminRow(page, target.nom).getByRole("button", { name: "Retirer vérification" }).click();
  await expect(page.getByText("Statut mis à jour.")).toBeVisible();
  await expect.poll(async () => (await getProfile(target.id)).verified).toBe(false);
  const profile = await getProfile(target.id);
  expect(profile.role).toBe("user"); // only the badge changed
});

test("admin : supprimer un avis", async ({ page }) => {
  const reviewer = await createUser();
  const { data: listing } = await db.from("listings").select("id").eq("titre", "Studio près du marché").single();
  const client = await clientAs(reviewer);
  const comment = `Avis à supprimer ${reviewer.nom}`;
  const { error } = await client.from("reviews").insert({ listing_id: listing.id, user_id: reviewer.id, reviewer_name: reviewer.nom, rating: 1, comment });
  expect(error).toBeNull();

  await login(page, SEED.admin);
  await clickNav(page, "⚙️ Admin");
  await page.getByRole("button", { name: /^Avis \(\d+\)$/ }).click();
  const row = adminRow(page, comment);
  await expect(row).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await row.getByRole("button", { name: "Supprimer" }).click();
  await expect(page.getByText("Avis supprimé.")).toBeVisible();
  await expect(page.getByText(comment)).toHaveCount(0);
  const { data } = await db.from("reviews").select("id").eq("user_id", reviewer.id);
  expect(data).toEqual([]);
});

test("un utilisateur normal n'a pas accès à l'admin", async ({ page }) => {
  const user = await createUser();
  await login(page, user);
  await open(page, "admin");
  await expect(page.getByText("Accès réservé aux administrateurs.")).toBeVisible();
});
