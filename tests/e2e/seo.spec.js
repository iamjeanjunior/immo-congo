// Real page addresses (/annonces, /annonce/12-maison-...), old "#/" links, titles and Google tags in the browser.
// (The link previews made by the Netlify Edge Function are tested in seo-edge.spec.js.)
import { test, expect, open, openMenu, login, createUser, db } from "./helpers.js";

const SITE_URL = "https://immocongo-jandj.netlify.app";

async function seeded(titre) {
  const { data, error } = await db.from("listings").select("*").eq("titre", titre).single();
  if (error) throw error;
  return data;
}

const canonical = page => page.locator('link[rel="canonical"]');
const robots = page => page.locator('meta[name="robots"]');
const description = page => page.locator('meta[name="description"]');

test("adresses : vraies adresses, retour et avance du navigateur @desktop", async ({ page }) => {
  const listing = await seeded("Maison 3 chambres – Gécamines");
  const path = `/annonce/${listing.id}-maison-3-chambres-gecamines-fungurume`;
  await open(page);
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await openMenu(page);
  await page.locator("nav").getByRole("button", { name: "Annonces", exact: true }).click();
  await expect(page).toHaveURL(/\/annonces$/);
  await expect(page.getByRole("heading", { name: "Annonces", exact: true })).toBeVisible();

  // Listing cards are real links to the listing's address.
  await page.getByPlaceholder("Rechercher (titre, lieu...)").fill(listing.titre);
  const card = page.locator(".listing-card", { hasText: listing.titre });
  await expect(card.locator(`a[href="${path}"]`)).toHaveCount(1);
  await card.locator(`a[href="${path}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.getByRole("heading", { name: listing.titre })).toBeVisible();

  await page.getByRole("link", { name: "ImmoCongo – accueil" }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.getByRole("heading", { name: listing.titre })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/annonces$/);
  await expect(page.getByRole("heading", { name: "Annonces", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.getByRole("heading", { name: listing.titre })).toBeVisible();
});

test("adresses : les anciens liens #/ mènent à la bonne page", async ({ page }) => {
  const listing = await seeded("Villa avec jardin");
  const cases = [
    [`/#/listing/${listing.id}`, `/annonce/${listing.id}-villa-avec-jardin-kolwezi`],
    ["/#/listings", "/annonces"],
    ["/#/auth", "/connexion"],
    ["/#/my-listings", "/mes-annonces"],
    ["/#/favorites", "/favoris"],
    ["/#/", "/"],
  ];
  for (const [old, now] of cases) {
    await page.goto("about:blank");
    await page.goto(old);
    await expect(page, old).toHaveURL(new RegExp(`127\\.0\\.0\\.1:\\d+${now.replace(/\//g, "\\/")}$`));
  }
  // The old listing link shows the listing.
  await page.goto("about:blank");
  await page.goto(`/#/listing/${listing.id}`);
  await expect(page.getByRole("heading", { name: listing.titre })).toBeVisible();
});

test("adresses : recharger une page profonde fonctionne @desktop", async ({ page }) => {
  const listing = await seeded("Appartement meublé centre-ville");
  const path = `/annonce/${listing.id}-appartement-meuble-centre-ville-lubumbashi`;
  await page.goto(path);
  await expect(page.getByRole("heading", { name: listing.titre })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: listing.titre })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${path}$`));

  // Short address (only the number): the full address replaces it.
  await page.goto(`/annonce/${listing.id}`);
  await expect(page.getByRole("heading", { name: listing.titre })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${path}$`));

  await page.goto("/annonces");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Annonces", exact: true })).toBeVisible();

  // Unknown address: the home page.
  await page.goto("/cette-page-n-existe-pas");
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await expect(page.getByRole("heading", { name: /Trouvez votre maison/ })).toBeVisible();
});

test("Google : titre, description et adresse officielle de chaque page publique", async ({ page }) => {
  const listing = await seeded("Maison 3 chambres – Gécamines");
  const path = `/annonce/${listing.id}-maison-3-chambres-gecamines-fungurume`;

  await open(page);
  await expect(page).toHaveTitle("ImmoCongo – Maisons à louer au Katanga");
  await expect(canonical(page)).toHaveAttribute("href", `${SITE_URL}/`);
  await expect(robots(page)).toHaveCount(0);

  await open(page, "listings");
  await expect(page).toHaveTitle(/annonces.*\| ImmoCongo$/i);
  await expect(canonical(page)).toHaveAttribute("href", `${SITE_URL}/annonces`);

  await open(page, `listing/${listing.id}`);
  await expect(page).toHaveTitle("Maison 3 chambres – Gécamines – Fungurume | ImmoCongo");
  await expect(canonical(page)).toHaveAttribute("href", SITE_URL + path);
  await expect(description(page)).toHaveAttribute("content", /^À louer à Fungurume \(Quartier Gécamines, rue 12\) : 800.\$ par mois, 3 chambres\. Grande maison avec cour/);
  await expect(robots(page)).toHaveCount(0);

  // A listing that doesn't exist (any more): not for Google.
  await open(page, "listing/987654");
  await expect(page.getByText("Annonce introuvable ou supprimée.")).toBeVisible();
  await expect(page).toHaveTitle("Annonce introuvable | ImmoCongo");
  await expect(robots(page)).toHaveAttribute("content", "noindex");
  await expect(canonical(page)).toHaveCount(0);
});

test("Google : les pages réservées aux membres sont noindex", async ({ page }) => {
  const user = await createUser();
  const checks = [["/connexion", "Connexion | ImmoCongo"]];
  for (const [path, title] of checks) {
    await page.goto(path);
    await expect(page).toHaveTitle(title);
    await expect(robots(page)).toHaveAttribute("content", "noindex");
    await expect(canonical(page)).toHaveCount(0);
  }
  await login(page, user);
  for (const [path, title] of [
    ["/publier", "Publier une annonce | ImmoCongo"],
    ["/favoris", "Mes favoris | ImmoCongo"],
    ["/messages", "Messages | ImmoCongo"],
    ["/mes-annonces", "Mes annonces | ImmoCongo"],
    ["/admin", "Administration | ImmoCongo"],
  ]) {
    await page.goto(path);
    await expect(page, path).toHaveTitle(title);
    await expect(robots(page), path).toHaveAttribute("content", "noindex");
    await expect(canonical(page), path).toHaveCount(0);
  }
  // Back to a public page: indexable again.
  await openMenu(page);
  await page.locator("nav").getByRole("button", { name: "Annonces", exact: true }).click();
  await expect(page).toHaveURL(/\/annonces$/);
  await expect(robots(page)).toHaveCount(0);
  await expect(canonical(page)).toHaveAttribute("href", `${SITE_URL}/annonces`);
});
