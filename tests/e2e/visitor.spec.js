// What a visitor WITHOUT an account can see and do today (2026-10-12).
// This records the current behaviour; the ROADMAP item "Browse without an account" may change it on purpose.
import { test, expect, open, openMenu, openFilters, db } from "./helpers.js";

async function seeded(titre) {
  const { data, error } = await db.from("listings").select("*").eq("titre", titre).single();
  if (error) throw error;
  return data;
}

test("visiteur : accueil, liste des annonces et recherche @desktop", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { name: /Trouvez votre maison/ })).toBeVisible();
  await expect(page.getByRole("search", { name: "Rechercher une maison" })).toBeVisible(); // the big search
  await expect(page.getByRole("heading", { name: "Comment ça marche ?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vous avez une maison à louer ?" })).toBeVisible();
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "+264 816 032 560" })).toHaveAttribute("href", "https://wa.me/264816032560");
  // "Annonces récentes": the 6 newest (4 seeded listings at least).
  await expect(page.locator(".listing-card").first()).toBeVisible();
  const cards = await page.locator(".listing-card").count();
  expect(cards).toBeGreaterThanOrEqual(4);
  expect(cards).toBeLessThanOrEqual(6);
  await openMenu(page);
  const nav = page.locator("nav");
  await expect(nav.getByRole("button", { name: "Connexion", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Créer un compte", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Mes annonces", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "Favoris", exact: true })).toHaveCount(0);

  // Every listing can be listed and found without an account.
  await open(page, "listings");
  const { count } = await db.from("listings").select("id", { count: "exact", head: true });
  await expect(page.getByText(/^\d+ annonces?$/)).toBeVisible();
  const shown = Number((await page.getByText(/^\d+ annonces?$/).textContent()).match(/\d+/)[0]);
  expect(shown, "the listings page counts every listing").toBeGreaterThanOrEqual(Math.min(count, 4));
  await page.getByPlaceholder("Rechercher (titre, lieu...)").fill("Villa avec jardin");
  await expect(page.locator(".listing-card", { hasText: "Villa avec jardin" })).toBeVisible();
  await expect(page.getByText("1 annonce", { exact: true })).toBeVisible();
  // A verified owner's listing carries the badge (the seeded admin is verified, Alice is not).
  await expect(page.locator(".listing-card", { hasText: "Villa avec jardin" }).getByTestId("verified-badge")).toHaveText("Vérifié");
  await page.getByPlaceholder("Rechercher (titre, lieu...)").fill("Studio près du marché");
  await expect(page.locator(".listing-card", { hasText: "Studio près du marché" })).toBeVisible();
  await expect(page.locator(".listing-card", { hasText: "Studio près du marché" }).getByTestId("verified-badge")).toHaveCount(0);

  // Filter by town.
  await page.getByPlaceholder("Rechercher (titre, lieu...)").fill("");
  await openFilters(page);
  await page.getByLabel("Ville", { exact: true }).selectOption("Lubumbashi");
  await expect(page.locator(".listing-card", { hasText: "Appartement meublé centre-ville" })).toBeVisible();
  await expect(page.locator(".listing-card", { hasText: "Villa avec jardin" })).toHaveCount(0);
});

test("visiteur : page d'une annonce @desktop", async ({ page }) => {
  const listing = await seeded("Maison 3 chambres – Gécamines");
  await open(page, `listing/${listing.id}`);
  await expect(page.getByRole("heading", { name: listing.titre })).toBeVisible();
  await expect(page.getByTestId("detail-location")).toContainText("Quartier Gécamines, rue 12");
  await expect(page.getByText("Grande maison avec cour")).toBeVisible();
  const owner = page.getByTestId("owner-card");
  await expect(owner).toContainText("Admin Test");
  await expect(owner.getByTestId("verified-badge")).toHaveText("Propriétaire vérifié"); // verified owner badge
  await expect(page.getByRole("link", { name: "Contacter sur WhatsApp" })).toHaveAttribute("href", "https://wa.me/243900000001");
  if (test.info().project.name === "phone") {
    // Phone: WhatsApp stays one tap away in a bar stuck to the bottom of the screen, also after scrolling.
    const bar = page.getByTestId("contact-bar");
    await expect(bar).toBeVisible();
    await expect(bar.getByRole("link", { name: "Contacter sur WhatsApp" })).toBeVisible();
    await page.mouse.wheel(0, 1500);
    await expect(bar).toBeInViewport();
    const box = await bar.boundingBox();
    expect(Math.round(box.y + box.height)).toBe(page.viewportSize().height);
    expect((await bar.getByRole("link", { name: "Contacter sur WhatsApp" }).boundingBox()).height).toBeGreaterThanOrEqual(44);
  } else {
    await expect(page.getByTestId("contact-bar")).toHaveCount(0);
  }
  await expect(page.getByText("Belle maison, propriétaire sérieux.")).toBeVisible(); // seeded review
  await expect(page.getByText("pour laisser un avis.")).toBeVisible();
  // No owner tools and no in-site message button for visitors.
  await expect(page.getByTestId("owner-tools")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Modifier", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Supprimer", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Message au propriétaire" })).toHaveCount(0);
  // The view counter works for visitors too.
  await expect.poll(async () => (await seeded(listing.titre)).views).toBeGreaterThan(listing.views);

  // "Ajouter aux favoris" sends a visitor to the login page.
  await page.getByTestId("detail-fav").click();
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
});

test("visiteur : les pages réservées demandent de se connecter @desktop", async ({ page }) => {
  await open(page, "post");
  await expect(page.getByText("Vous devez être connecté pour publier.")).toBeVisible();
  await open(page, "favorites");
  await expect(page.getByText("Connectez-vous pour voir vos favoris.")).toBeVisible();
  await open(page, "messages");
  await expect(page.getByText("Connectez-vous pour voir vos messages.")).toBeVisible();
  await open(page, "my-listings");
  await expect(page.getByText("Connectez-vous pour voir vos annonces.")).toBeVisible();
  await expect(page.getByText("Vous n'avez pas encore d'annonces.")).toHaveCount(0);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  await open(page, "admin");
  await expect(page.getByText("Accès réservé aux administrateurs.")).toBeVisible();

  // "Publier ma maison" on the home page opens the signup form.
  await open(page);
  await page.getByRole("button", { name: "Publier ma maison" }).click();
  await expect(page.getByRole("heading", { name: "Créer un compte" })).toBeVisible();
});

test("accueil : la recherche (ville, prix max, chambres) ouvre les annonces filtrées @desktop", async ({ page }) => {
  await open(page);
  const search = page.getByRole("search", { name: "Rechercher une maison" });
  await search.getByLabel("Ville").selectOption("Fungurume");
  await search.getByLabel("Prix max par mois en USD").fill("900");
  await search.getByLabel("Chambres").selectOption({ label: "2 ou plus" });
  await search.getByRole("button", { name: "Rechercher" }).click();

  // Straight to the listings page, with the same filters.
  await expect(page).toHaveURL(/#\/listings$/);
  await expect(page.getByRole("heading", { name: "Annonces", exact: true })).toBeVisible();
  await openFilters(page);
  await expect(page.getByLabel("Ville", { exact: true })).toHaveValue("Fungurume");
  await expect(page.getByLabel("Prix max en USD")).toHaveValue("900");
  await expect(page.getByLabel("Chambres", { exact: true })).toHaveValue("2");
  if (test.info().project.name === "phone") await expect(page.getByRole("button", { name: "Filtres (3)" })).toBeVisible();

  // Seeded: "Maison 3 chambres" (Fungurume, 800, 3 rooms) matches; the studio (1 room),
  // the villa (Kolwezi) and the apartment (Lubumbashi) don't. Other tests add many cheaper listings
  // at the same time, so sort by price to see the seeded house on the first page.
  await page.getByLabel("Trier par").selectOption("price_desc");
  await expect(page.locator(".listing-card", { hasText: "Maison 3 chambres – Gécamines" })).toBeVisible();
  for (const titre of ["Studio près du marché", "Villa avec jardin", "Appartement meublé centre-ville"]) {
    await expect(page.locator(".listing-card", { hasText: titre })).toHaveCount(0);
  }
  // Every card shown matches the search.
  for (const card of await page.locator(".listing-card").all()) {
    await expect(card).toContainText("Fungurume");
  }

  // "Effacer les filtres" shows every listing again.
  await page.getByRole("button", { name: "Effacer les filtres" }).click();
  await expect(page.locator(".listing-card", { hasText: "Villa avec jardin" })).toBeVisible();
  await expect(page.getByLabel("Chambres", { exact: true })).toHaveValue("");
});
