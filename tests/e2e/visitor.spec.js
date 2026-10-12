// What a visitor WITHOUT an account can see and do today (2026-10-12).
// This records the current behaviour; the ROADMAP item "Browse without an account" may change it on purpose.
import { test, expect, open, openMenu, db } from "./helpers.js";

async function seeded(titre) {
  const { data, error } = await db.from("listings").select("*").eq("titre", titre).single();
  if (error) throw error;
  return data;
}

test("visiteur : accueil, liste des annonces et recherche @desktop", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { name: /Trouvez votre maison/ })).toBeVisible();
  await expect(page.getByText("Annonces publiées")).toBeVisible();
  await expect(page.locator(".listing-card")).toHaveCount(3); // "Annonces récentes": the 3 newest
  await openMenu(page);
  await expect(page.getByRole("button", { name: "Connexion" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Créer un compte" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mes annonces" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "♥ Favoris" })).toHaveCount(0);

  // Every listing can be listed and found without an account.
  await open(page, "listings");
  const { count } = await db.from("listings").select("id", { count: "exact", head: true });
  await expect(page.getByText(/^\d+ annonces?$/)).toBeVisible();
  const shown = Number((await page.getByText(/^\d+ annonces?$/).textContent()).match(/\d+/)[0]);
  expect(shown, "the listings page counts every listing").toBeGreaterThanOrEqual(Math.min(count, 4));
  await page.getByPlaceholder("Rechercher (titre, lieu...)").fill("Villa avec jardin");
  await expect(page.locator(".listing-card", { hasText: "Villa avec jardin" })).toBeVisible();
  await expect(page.getByText("1 annonce", { exact: true })).toBeVisible();

  // Filter by town.
  await page.getByPlaceholder("Rechercher (titre, lieu...)").fill("");
  await page.locator("select").filter({ hasText: "Toutes les villes" }).selectOption("Lubumbashi");
  await expect(page.locator(".listing-card", { hasText: "Appartement meublé centre-ville" })).toBeVisible();
  await expect(page.locator(".listing-card", { hasText: "Villa avec jardin" })).toHaveCount(0);
});

test("visiteur : page d'une annonce @desktop", async ({ page }) => {
  const listing = await seeded("Maison 3 chambres – Gécamines");
  await open(page, `listing/${listing.id}`);
  await expect(page.getByRole("heading", { name: listing.titre })).toBeVisible();
  await expect(page.getByText("📍 Quartier Gécamines, rue 12")).toBeVisible();
  await expect(page.getByText("Grande maison avec cour")).toBeVisible();
  await expect(page.getByText("Admin Test ✔️")).toBeVisible(); // verified owner badge
  await expect(page.getByRole("link", { name: "💬 Contacter sur WhatsApp" })).toHaveAttribute("href", "https://wa.me/243900000001");
  await expect(page.getByText("Belle maison, propriétaire sérieux.")).toBeVisible(); // seeded review
  await expect(page.getByText("pour laisser un avis.")).toBeVisible();
  // No owner tools and no in-site message button for visitors.
  await expect(page.getByRole("button", { name: "✏️ Modifier" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "🗑️ Supprimer" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "💬 Message au propriétaire" })).toHaveCount(0);
  // The view counter works for visitors too.
  await expect.poll(async () => (await seeded(listing.titre)).views).toBeGreaterThan(listing.views);

  // "Ajouter aux favoris" sends a visitor to the login page.
  await page.getByRole("button", { name: "♡ Ajouter aux favoris" }).click();
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
});

test("visiteur : les pages réservées demandent de se connecter", async ({ page }) => {
  await open(page, "post");
  await expect(page.getByText("Vous devez être connecté pour publier.")).toBeVisible();
  await open(page, "favorites");
  await expect(page.getByText("Connectez-vous pour voir vos favoris.")).toBeVisible();
  await open(page, "messages");
  await expect(page.getByText("Connectez-vous pour voir vos messages.")).toBeVisible();
  await open(page, "my-listings");
  await expect(page.getByText("Vous n'avez pas encore d'annonces.")).toBeVisible(); // no login prompt here today
  await open(page, "admin");
  await expect(page.getByText("Accès réservé aux administrateurs.")).toBeVisible();

  // "Publier ma maison" on the home page opens the signup form.
  await open(page);
  await page.getByRole("button", { name: "Publier ma maison" }).click();
  await expect(page.getByRole("heading", { name: "Créer un compte" })).toBeVisible();
});
