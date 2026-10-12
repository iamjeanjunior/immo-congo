// Listings: publish with photos, listing page, edit, delete, admin edit, account without profile, wrong file type.
import fs from "node:fs";
import {
  test, expect, open, login, createUser, createListing, getListing, getProfile, listPhotoFiles,
  storagePath, fixture, db, uid, SEED, PUBLIC_PHOTO_PREFIX,
} from "./helpers.js";

// Fills the publish form (the labels are not linked to their fields, so fields are found by placeholder / position).
async function fillListingForm(page, { titre, prix = "650", ville = "Fungurume", chambres = "3", localisation = "Quartier Mutoshi, rue 4", description = "Belle maison de test, eau et électricité." }) {
  await page.getByPlaceholder("Ex: Maison 3 chambres – Gécamines").fill(titre);
  await page.getByPlaceholder("800").fill(prix);
  await page.locator("label", { hasText: "Ville *" }).locator("xpath=following-sibling::select").selectOption(ville);
  await page.getByPlaceholder("3", { exact: true }).fill(chambres);
  await page.getByPlaceholder("Ex: Quartier Gécamines, rue 12").fill(localisation);
  await page.getByPlaceholder("Décrivez la maison...").fill(description);
}

const formPhotos = page => page.locator("form img");

async function imageSize(page, url) {
  return page.evaluate(src => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error(`cannot load ${src}`));
    img.src = src;
  }), url);
}

test("publier une annonce avec 2 photos, puis la page de l'annonce montre les photos @desktop", async ({ page }) => {
  const owner = await createUser();
  await login(page, owner);
  await open(page, "post");
  await expect(page.getByRole("heading", { name: /Publier une annonce/ })).toBeVisible();

  const titre = `Maison avec photos ${uid()}`;
  await fillListingForm(page, { titre, ville: "Kolwezi" });
  await page.locator('input[type="file"]').setInputFiles([fixture("photo-1.png"), fixture("photo-2.jpg")]);
  await expect(formPhotos(page)).toHaveCount(2);
  await expect(page.getByText("principale", { exact: true })).toBeVisible(); // first photo = main photo

  await page.getByRole("button", { name: "Publier l'annonce" }).click();
  await expect(page.getByText("Annonce publiée avec succès !")).toBeVisible({ timeout: 20_000 });

  // Saved in the database with 2 photo links into the owner's Storage folder.
  const { data: row } = await db.from("listings").select("*").eq("titre", titre).single();
  expect(row).toMatchObject({ owner_id: owner.id, owner_name: owner.nom, ville: "Kolwezi", whatsapp: owner.whatsapp, prix: 650, chambres: 3 });
  const urls = JSON.parse(row.images);
  expect(urls).toHaveLength(2);
  expect(row.image_url).toBe(urls[0]);
  for (const url of urls) expect(url.startsWith(`${PUBLIC_PHOTO_PREFIX}${owner.id}/`), url).toBe(true);

  await test.step("photos are shrunk and stored in Storage", async () => {
    const files = await listPhotoFiles(owner.id);
    expect(files.map(f => `${owner.id}/${f.name}`).sort()).toEqual(urls.map(storagePath).sort());
    const originals = ["photo-1.png", "photo-2.jpg"].map(name => fs.statSync(fixture(name)).size);
    urls.forEach((url, i) => {
      const file = files.find(f => `${owner.id}/${f.name}` === storagePath(url));
      expect(file.metadata.mimetype, file.name).toMatch(/^image\/(webp|jpeg)$/);
      expect(file.metadata.size, `${file.name} is smaller than the original`).toBeLessThan(originals[i]);
      expect(file.metadata.size, `${file.name} is under 300 KB`).toBeLessThanOrEqual(300 * 1024);
    });
    // photo-1.png is 1800×1200 and photo-2.jpg 2000×1500: both must come back at most 1600px wide.
    const sizes = [await imageSize(page, urls[0]), await imageSize(page, urls[1])];
    expect(sizes[0]).toEqual({ width: 1600, height: 1067 });
    expect(sizes[1]).toEqual({ width: 1600, height: 1200 });
  });

  await test.step("the listings page shows the main photo and the photo count", async () => {
    await expect(page.getByText("🔍 Filtres")).toBeVisible(); // after publishing, the site shows the listings page
    await page.getByPlaceholder("Rechercher (titre, lieu...)").fill(titre);
    const card = page.locator(".listing-card", { hasText: titre });
    await expect(card.getByRole("img", { name: titre })).toHaveAttribute("src", urls[0]);
    await expect(card.getByText("📷 2")).toBeVisible();
  });

  await test.step("the listing page shows both photos", async () => {
    await open(page, `listing/${row.id}`);
    const main = page.getByRole("img", { name: titre });
    await expect(main).toHaveAttribute("src", urls[0]);
    await expect.poll(() => main.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    const thumbs = page.locator(`img[alt=""][src^="${PUBLIC_PHOTO_PREFIX}"]`);
    await expect(thumbs).toHaveCount(2);
    await thumbs.nth(1).click();
    await expect(main).toHaveAttribute("src", urls[1]);
    await expect.poll(() => main.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.getByText("📷 Photos")).toBeVisible();
  });
});

test("modifier : retirer une photo supprime aussi son fichier", async ({ page }) => {
  const owner = await createUser();
  const listing = await createListing(owner, { photos: ["photo-1.png", "photo-2.jpg"] });
  const [keep, remove] = listing.photoUrls;
  expect(await listPhotoFiles(owner.id)).toHaveLength(2);

  await login(page, owner);
  await open(page, `listing/${listing.id}`);
  await page.getByRole("button", { name: "✏️ Modifier" }).click();
  await expect(page.getByRole("heading", { name: /Modifier l'annonce/ })).toBeVisible();
  await expect(formPhotos(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Retirer cette photo" }).nth(1).click();
  await expect(formPhotos(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Annonce modifiée !")).toBeVisible();

  const saved = await getListing(listing.id);
  expect(JSON.parse(saved.images)).toEqual([keep]);
  expect(saved.image_url).toBe(keep);
  await expect.poll(async () => (await listPhotoFiles(owner.id)).map(f => `${owner.id}/${f.name}`), { message: "removed photo's file is deleted" })
    .toEqual([storagePath(keep)]);
  expect(storagePath(remove)).not.toBe(storagePath(keep));
});

test("supprimer une annonce supprime aussi ses fichiers photo", async ({ page }) => {
  const owner = await createUser();
  const listing = await createListing(owner, { photos: ["photo-1.png", "photo-2.jpg"] });
  expect(await listPhotoFiles(owner.id)).toHaveLength(2);

  await login(page, owner);
  await open(page, "my-listings");
  await expect(page.getByRole("heading", { name: listing.titre })).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "🗑️ Supprimer" }).click();
  await expect(page.getByText("Annonce supprimée.")).toBeVisible();

  expect(await getListing(listing.id)).toBeNull();
  await expect.poll(async () => (await listPhotoFiles(owner.id)).length, { message: "photo files are deleted" }).toBe(0);
});

test("un admin qui modifie l'annonce de quelqu'un d'autre ne devient pas propriétaire", async ({ page }) => {
  const owner = await createUser();
  const listing = await createListing(owner, { photos: ["photo-2.jpg"] });

  await login(page, SEED.admin);
  await open(page, `listing/${listing.id}`);
  await page.getByRole("button", { name: "✏️ Modifier" }).click();
  const newTitle = `${listing.titre} (corrigé par l'admin)`;
  await page.getByPlaceholder("Ex: Maison 3 chambres – Gécamines").fill(newTitle);
  // Empty WhatsApp field: the listing must keep the owner's number, not take the admin's.
  await page.locator("label", { hasText: "WhatsApp de contact" }).locator("xpath=following-sibling::input").fill("");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Annonce modifiée !")).toBeVisible();

  const saved = await getListing(listing.id);
  expect(saved).toMatchObject({ titre: newTitle, owner_id: owner.id, owner_name: owner.nom, whatsapp: owner.whatsapp });
  expect(JSON.parse(saved.images)).toEqual(listing.photoUrls);
  expect(await listPhotoFiles(owner.id), "the owner's photo is still there").toHaveLength(1);
});

test("un compte sans profil peut publier (le profil est créé tout seul)", async ({ page }) => {
  // Seeded account Bruno has no profile row (like Junior's old second account).
  // Make sure of it, even if this test already ran on this database.
  await db.from("listings").delete().eq("owner_id", SEED.bruno.id);
  await db.from("profiles").delete().eq("id", SEED.bruno.id);
  expect(await getProfile(SEED.bruno.id)).toBeNull();

  await login(page, SEED.bruno);
  await open(page, "post");
  const titre = `Annonce de Bruno ${uid()}`;
  await fillListingForm(page, { titre });
  await page.locator("label", { hasText: "WhatsApp de contact" }).locator("xpath=following-sibling::input").fill("+243 990 000 333");
  await page.getByRole("button", { name: "Publier l'annonce" }).click();
  await expect(page.getByText("Annonce publiée avec succès !")).toBeVisible();

  const profile = await getProfile(SEED.bruno.id);
  expect(profile).toMatchObject({ nom: SEED.bruno.nom, whatsapp: SEED.bruno.whatsapp, role: "user", verified: false });
  const { data: row } = await db.from("listings").select("*").eq("titre", titre).single();
  expect(row).toMatchObject({ owner_id: SEED.bruno.id, owner_name: SEED.bruno.nom, whatsapp: "+243 990 000 333" });
});

test("un PDF est refusé avec un message clair", async ({ page }) => {
  const user = await createUser();
  await login(page, user);
  await open(page, "post");
  await page.locator('input[type="file"]').setInputFiles(fixture("contrat.pdf"));
  await expect(page.getByText("« contrat.pdf » : format non accepté. Choisissez une photo (JPG, PNG ou WebP).")).toBeVisible();
  await expect(formPhotos(page)).toHaveCount(0);
  expect(await listPhotoFiles(user.id)).toHaveLength(0);
});

test("un admin qui supprime l'annonce de quelqu'un d'autre supprime aussi ses photos", async ({ page }) => {
  test.fail(true, "BUG (known, ROADMAP 'Ideas / later'): Storage only lets users delete files in their own folder, so when an admin deletes someone else's listing its photo files stay in Storage (same when an admin removes a photo while editing someone else's listing). Needs an admin delete rule on storage.objects.");
  const owner = await createUser();
  const listing = await createListing(owner, { photos: ["photo-1.png"] });

  await login(page, SEED.admin);
  await open(page, `listing/${listing.id}`);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "🗑️ Supprimer" }).click();
  await expect(page.getByText("Annonce supprimée.")).toBeVisible();
  expect(await getListing(listing.id)).toBeNull();
  await expect.poll(async () => (await listPhotoFiles(owner.id)).length, { message: "the owner's photo file is deleted", timeout: 5_000 }).toBe(0);
});
