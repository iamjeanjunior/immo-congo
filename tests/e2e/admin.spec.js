// Admin panel: "Vérifier" badge, deleting a review, access for non-admins.
import { test, expect, open, login, clickNav, createUser, createListing, clientAs, getProfile, deleteAndConfirm, db, SEED } from "./helpers.js";

// The admin row that holds `text`.
const adminRow = (page, text) => page.getByTestId("admin-row").filter({ hasText: text });

test("admin : le bouton Vérifier donne puis retire le badge vérifié @desktop", async ({ page }) => {
  const target = await createUser();
  const listing = await createListing(target);

  await login(page, SEED.admin);
  await clickNav(page, "Admin");
  await page.getByRole("button", { name: /^Utilisateurs \(\d+\)$/ }).click();
  const row = adminRow(page, target.nom);
  await expect(row).toBeVisible();
  await expect(row.getByTestId("verified-badge")).toHaveCount(0);

  await row.getByRole("button", { name: "Vérifier" }).click();
  await expect(page.getByText("Statut mis à jour.")).toBeVisible();
  await expect(row.getByTestId("verified-badge")).toHaveText("Vérifié");
  await expect.poll(async () => (await getProfile(target.id)).verified).toBe(true);

  // The badge shows on the owner's card on their listing, and on the listing's card in the list.
  await open(page, `listing/${listing.id}`);
  const owner = page.getByTestId("owner-card");
  await expect(owner).toContainText(target.nom);
  await expect(owner.getByTestId("verified-badge")).toHaveText("Propriétaire vérifié");
  await open(page, "listings");
  await page.getByPlaceholder("Rechercher (titre, lieu...)").fill(listing.titre);
  await expect(page.locator(".listing-card", { hasText: listing.titre }).getByTestId("verified-badge")).toBeVisible();

  await clickNav(page, "Admin");
  await page.getByRole("button", { name: /^Utilisateurs \(\d+\)$/ }).click();
  await adminRow(page, target.nom).getByRole("button", { name: "Retirer vérification" }).click();
  await expect(page.getByText("Statut mis à jour.")).toBeVisible();
  await expect.poll(async () => (await getProfile(target.id)).verified).toBe(false);
  const profile = await getProfile(target.id);
  expect(profile.role).toBe("user"); // only the badge changed
});

test("admin : supprimer un avis (fenêtre de confirmation du site)", async ({ page }) => {
  const reviewer = await createUser();
  const { data: listing } = await db.from("listings").select("id").eq("titre", "Studio près du marché").single();
  const client = await clientAs(reviewer);
  const comment = `Avis à supprimer ${reviewer.nom}`;
  const { error } = await client.from("reviews").insert({ listing_id: listing.id, user_id: reviewer.id, reviewer_name: reviewer.nom, rating: 1, comment });
  expect(error).toBeNull();

  await login(page, SEED.admin);
  await clickNav(page, "Admin");
  await page.getByRole("button", { name: /^Avis \(\d+\)$/ }).click();
  const row = adminRow(page, comment);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Supprimer" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Supprimer cet avis ?");
  await expect(page.getByRole("alertdialog")).toContainText(`L'avis de ${reviewer.nom} sera supprimé définitivement.`);
  await page.getByRole("alertdialog").getByRole("button", { name: "Annuler" }).click();
  await expect(row).toBeVisible(); // "Annuler" keeps the review

  await deleteAndConfirm(page, row.getByRole("button", { name: "Supprimer" }));
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
