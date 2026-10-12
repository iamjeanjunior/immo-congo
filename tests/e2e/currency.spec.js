// Currencies (like Booking.com): visitors pick the currency prices are shown in. Prices are converted
// with the day's rate stored in our own table exchange_rates. Locally the rates are fixed by
// supabase/seed.sql (1 USD = 2 500 CDF = 0,8 EUR = 18 ZAR = 25 ZMW), so these tests never need the internet.
import { test, expect, open, login, openFilters, createUser, createListing, uid, db } from "./helpers.js";

const card = (page, titre) => page.locator(".listing-card", { hasText: titre });
const cardPrice = (page, titre) => card(page, titre).getByTestId("price");
const currencyButton = page => page.getByRole("button", { name: /^Devise/ });
const sheet = page => page.getByRole("dialog", { name: "Choisir la devise" });

async function pickCurrency(page, code) {
  await currencyButton(page).click();
  await expect(sheet(page)).toBeVisible();
  await sheet(page).getByRole("radio", { name: new RegExp(`^${code} `) }).click();
  await expect(sheet(page)).toHaveCount(0);
}

test("devise : choisir la devise change tous les prix tout de suite, sans recharger, et le choix reste @desktop", async ({ page }) => {
  const owner = await createUser();
  const tag = `Devise ${uid()}`;
  const francs = await createListing(owner, { titre: `${tag} francs`, prix: 200000, devise: "CDF", ville: "Likasi" });
  const dollars = await createListing(owner, { titre: `${tag} dollars`, prix: 300, devise: "USD", ville: "Likasi" });
  const rands = await createListing(owner, { titre: `${tag} rands`, prix: 250, devise: "ZAR", ville: "Likasi" });
  const arrondi = await createListing(owner, { titre: `${tag} arrondi`, prix: 123, devise: "USD", ville: "Likasi" });

  await open(page, "listings");
  await page.evaluate(() => { window.__sansRechargement = true; });
  await page.getByPlaceholder("Rechercher (titre, lieu...)").fill(tag);

  // USD by default. Only the converted price, rounded, no "≈" and no second price.
  await expect(currencyButton(page)).toContainText("$ USD");
  await expect(cardPrice(page, francs.titre)).toHaveText("80 $/mois"); // 200 000 / 2 500
  await expect(cardPrice(page, dollars.titre)).toHaveText("300 $/mois");
  await expect(cardPrice(page, rands.titre)).toHaveText("14 $/mois"); // 250 / 18 = 13,9
  await expect(page.locator(".listing-card").first()).not.toContainText("≈");
  await expect(card(page, francs.titre)).not.toContainText("200 000");

  // The currency sheet: USD and CDF first, then EUR, ZAR, ZMW. The current one is selected and focused.
  await currencyButton(page).click();
  await expect(sheet(page)).toBeVisible();
  expect(await sheet(page).getByRole("radio").evaluateAll(els => els.map(el => el.getAttribute("aria-label")))).toEqual([
    "USD – Dollar américain", "CDF – Franc congolais", "EUR – Euro", "ZAR – Rand sud-africain", "ZMW – Kwacha zambien",
  ]);
  await expect(sheet(page).getByRole("radio", { name: /^USD / })).toHaveAttribute("aria-checked", "true");
  await expect(sheet(page).getByRole("radio", { name: /^USD / })).toBeFocused();
  await expect(sheet(page)).toContainText("Prix convertis au taux du jour (1 USD = 2 500 FC, mis à jour le");
  await sheet(page).getByRole("radio", { name: /^CDF / }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(currencyButton(page)).toBeFocused(); // the focus goes back to the button
  await expect(currencyButton(page)).toContainText("FC CDF");

  // Francs: rounded to 500 FC (1 000 FC from 100 000 FC), French spacing.
  await expect(cardPrice(page, francs.titre)).toHaveText("200 000 FC/mois");
  await expect(cardPrice(page, dollars.titre)).toHaveText("750 000 FC/mois");
  await expect(cardPrice(page, rands.titre)).toHaveText("34 500 FC/mois"); // 34 722 → 34 500
  await expect(cardPrice(page, arrondi.titre)).toHaveText("308 000 FC/mois"); // 307 500 → 308 000
  expect(await page.evaluate(() => window.__sansRechargement), "no page reload").toBe(true);

  // Esc and a tap outside close the sheet without changing anything.
  await currencyButton(page).click();
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await currencyButton(page).click();
  await page.mouse.click(5, 5);
  await expect(sheet(page)).toHaveCount(0);
  await expect(currencyButton(page)).toContainText("FC CDF");

  await pickCurrency(page, "EUR");
  await expect(cardPrice(page, francs.titre)).toHaveText("64 €/mois");
  await expect(cardPrice(page, dollars.titre)).toHaveText("240 €/mois");
  await expect(cardPrice(page, rands.titre)).toHaveText("11 €/mois");

  // Remembered on this device after a reload.
  await page.reload();
  await expect(currencyButton(page)).toContainText("€ EUR");
  expect(await page.evaluate(() => localStorage.getItem("immocongo.devise"))).toBe("EUR");
  await page.getByPlaceholder("Rechercher (titre, lieu...)").fill(tag);
  await expect(cardPrice(page, francs.titre)).toHaveText("64 €/mois");

  // The rate and the source, once, discreetly in the footer.
  await expect(page.getByTestId("footer-rate")).toContainText("Prix convertis au taux du jour (1 USD = 2 500 FC, mis à jour le");
  await expect(page.getByRole("link", { name: "Rates By Exchange Rate API" })).toHaveAttribute("href", "https://www.exchangerate-api.com");

  // The listing page gives the owner's own price in one small line.
  await open(page, `listing/${francs.id}`);
  await expect(page.getByTestId("price").first()).toHaveText("64 €/mois");
  await expect(page.getByTestId("owner-price")).toHaveText("Prix fixé par le propriétaire : 200 000 FC");
  if (test.info().project.name === "phone") await expect(page.getByTestId("bar-price")).toHaveText("64 €/mois");
  // In the listing's own currency there is nothing to explain.
  await pickCurrency(page, "CDF");
  await expect(page.getByTestId("price").first()).toHaveText("200 000 FC/mois");
  await expect(page.getByTestId("owner-price")).toHaveCount(0);
});

test("devise : le prix max et le tri comparent les annonces en USD et en CDF @desktop", async ({ page }) => {
  const owner = await createUser();
  const tag = `Filtre ${uid()}`;
  const a = await createListing(owner, { titre: `${tag} A`, prix: 200000, devise: "CDF", ville: "Kipushi" }); //  80 $
  const b = await createListing(owner, { titre: `${tag} B`, prix: 100, devise: "USD", ville: "Kipushi" });    // 100 $
  const c = await createListing(owner, { titre: `${tag} C`, prix: 600000, devise: "CDF", ville: "Kipushi" }); // 240 $

  await open(page, "listings");
  await page.getByPlaceholder("Rechercher (titre, lieu...)").fill(tag);
  await openFilters(page);
  await expect(page.getByTestId("field-currency").first()).toHaveText("$"); // the symbol is in the field
  await page.getByLabel("Prix max en USD").fill("150");
  await expect(card(page, a.titre)).toBeVisible();
  await expect(card(page, b.titre)).toBeVisible();
  await expect(card(page, c.titre)).toHaveCount(0);
  await expect(page.getByTestId("results-count")).toHaveText("2 annonces");
  await page.getByLabel("Trier par").selectOption("price_asc");
  await expect(page.locator(".listing-card h3")).toHaveText([a.titre, b.titre]);

  // In francs the filter is converted too (150 $ = 375 000 FC): same result.
  await pickCurrency(page, "CDF");
  await openFilters(page);
  await expect(page.getByLabel("Prix max en CDF")).toHaveValue("375000");
  await expect(page.getByTestId("field-currency").first()).toHaveText("FC");
  await expect(page.getByTestId("results-count")).toHaveText("2 annonces");
  await page.getByLabel("Prix max en CDF").fill("250000"); // B is 100 $ = 250 000 FC
  await expect(page.getByTestId("results-count")).toHaveText("2 annonces");
  await page.getByLabel("Prix max en CDF").fill("240000");
  await expect(card(page, a.titre)).toBeVisible();
  await expect(card(page, b.titre)).toHaveCount(0);
  await page.getByLabel("Prix max en CDF").fill("");
  await page.getByLabel("Trier par").selectOption("price_desc");
  await expect(page.locator(".listing-card h3")).toHaveText([c.titre, b.titre, a.titre]);

  // The home search uses the chosen currency as well.
  await open(page);
  const search = page.getByRole("search", { name: "Rechercher une maison" });
  await expect(search.getByTestId("field-currency")).toHaveText("FC");
  await search.getByLabel("Ville").selectOption("Kipushi");
  await search.getByLabel("Prix max par mois en CDF").fill("300000");
  await search.getByRole("button", { name: "Rechercher" }).click();
  await expect(card(page, a.titre)).toBeVisible();
  await expect(card(page, b.titre)).toBeVisible();
  await expect(card(page, c.titre)).toHaveCount(0);
});

test("devise : sans taux, les prix d'origine ; avec une partie des taux, seulement les devises possibles", async ({ page }) => {
  const owner = await createUser();
  const tag = `Sans taux ${uid()}`;
  const francs = await createListing(owner, { titre: `${tag} francs`, prix: 200000, devise: "CDF", ville: "Likasi" });
  const dollars = await createListing(owner, { titre: `${tag} dollars`, prix: 300, devise: "USD", ville: "Likasi" });
  const rands = await createListing(owner, { titre: `${tag} rands`, prix: 250, devise: "ZAR", ville: "Likasi" });

  // 1. No rate at all (empty table, or the table can't be read): the owners' prices, no currency button.
  for (const answer of [{ status: 200, body: "[]" }, { status: 500, body: '{"message":"boom"}' }]) {
    await page.unrouteAll();
    await page.route(/\/rest\/v1\/exchange_rates/, route => route.fulfill({ status: answer.status, contentType: "application/json", body: answer.body }));
    await open(page, "listings");
    await page.getByPlaceholder("Rechercher (titre, lieu...)").fill(tag);
    await expect(cardPrice(page, francs.titre)).toHaveText("200 000 FC/mois");
    await expect(cardPrice(page, dollars.titre)).toHaveText("300 $/mois");
    await expect(cardPrice(page, rands.titre)).toHaveText("250 R/mois");
    await expect(page.getByTestId("currency-button")).toHaveCount(0);
    await expect(page.getByTestId("footer-rate")).toHaveCount(0);
  }
  // A price filter can't compare a listing in another currency without a rate: it stays in the list.
  await openFilters(page);
  await page.getByLabel("Prix max en USD").fill("150");
  await expect(card(page, dollars.titre)).toHaveCount(0);
  await expect(card(page, francs.titre)).toBeVisible();
  await open(page, `listing/${francs.id}`);
  await expect(page.getByTestId("price").first()).toHaveText("200 000 FC/mois");
  await expect(page.getByTestId("owner-price")).toHaveCount(0);

  // 2. Only the CDF rate, and this visitor had chosen EUR before: back to USD, and only USD / CDF offered.
  await page.unrouteAll();
  const now = new Date().toISOString();
  await page.route(/\/rest\/v1\/exchange_rates/, route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify([{ quote: "CDF", rate: 2500, source_updated_at: now, updated_at: now }]),
  }));
  await page.addInitScript(() => localStorage.setItem("immocongo.devise", "EUR"));
  await open(page, "listings");
  await page.getByPlaceholder("Rechercher (titre, lieu...)").fill(tag);
  await expect(currencyButton(page)).toContainText("$ USD");
  await expect(cardPrice(page, francs.titre)).toHaveText("80 $/mois");
  await expect(cardPrice(page, rands.titre)).toHaveText("250 R/mois"); // no ZAR rate: the owner's price
  await currencyButton(page).click();
  expect(await sheet(page).getByRole("radio").evaluateAll(els => els.map(el => el.getAttribute("aria-label")))).toEqual([
    "USD – Dollar américain", "CDF – Franc congolais",
  ]);
});

test("publier en CDF garde la devise choisie par le propriétaire", async ({ page }) => {
  const user = await createUser();
  await login(page, user);
  await open(page, "post");
  const titre = `Maison en francs ${uid()}`;
  await page.getByPlaceholder("Ex: Maison 3 chambres – Gécamines").fill(titre);
  await page.getByPlaceholder("800").fill("450000");
  await page.getByLabel("Devise", { exact: true }).selectOption("CDF");
  await page.getByLabel("Ville *", { exact: true }).selectOption("Likasi");
  await page.getByPlaceholder("3", { exact: true }).fill("2");
  await page.getByPlaceholder("Ex: Quartier Gécamines, rue 12").fill("Quartier Test");
  await page.getByPlaceholder("Décrivez la maison...").fill("Annonce en francs congolais.");
  await page.getByRole("button", { name: "Publier l'annonce" }).click();
  await expect(page.getByText("Annonce publiée avec succès !")).toBeVisible();

  const { data: row } = await db.from("listings").select("id, prix, devise").eq("titre", titre).single();
  expect(row).toMatchObject({ prix: 450000, devise: "CDF" }); // stored as the owner wrote it, never converted
  await page.getByPlaceholder("Rechercher (titre, lieu...)").fill(titre);
  await expect(cardPrice(page, titre)).toHaveText("180 $/mois");
  await open(page, `listing/${row.id}`);
  await expect(page.getByTestId("owner-price")).toHaveText("Prix fixé par le propriétaire : 450 000 FC");
});
