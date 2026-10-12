// Accounts: signup, login, logout.
import { test, expect, open, openMenu, clickNav, navButton, login, createUser, getProfile, db, uid, SEED } from "./helpers.js";

test("créer un compte : le profil est créé avec le nom et le WhatsApp @desktop", async ({ page }) => {
  const id = uid();
  const nom = `Jean Nouveau ${id}`;
  const email = `signup-${id}@example.com`;
  const whatsapp = "+243 970 123 456";

  await open(page, "auth");
  await page.getByText("S'inscrire", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Créer un compte" })).toBeVisible();
  // Every field has its label (tapping the label goes to the field).
  await page.getByLabel("Nom complet *").fill(nom);
  await page.getByLabel("Email *").fill(email);
  await page.getByLabel("Mot de passe *").fill("TestPass-2026!");
  await page.getByLabel("Numéro WhatsApp *").fill(whatsapp);
  await page.getByRole("button", { name: "Créer mon compte" }).click();

  await expect(page.getByText(`Bienvenue, ${nom} !`)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Trouvez votre maison/ })).toBeVisible(); // back on the home page
  await expect(await navButton(page, "Déconnexion")).toBeVisible();
  await expect(page.locator("nav").getByRole("button", { name: "Publier", exact: true })).toBeVisible();

  // In the database: the account and its profile (normal user, not verified).
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  const account = users.users.find(u => u.email === email);
  expect(account, "the account exists").toBeTruthy();
  expect(account.user_metadata).toMatchObject({ nom, whatsapp });
  const profile = await getProfile(account.id);
  expect(profile).toMatchObject({ nom, whatsapp, role: "user", verified: false });
});

test("créer un compte avec un email déjà utilisé : message clair en français", async ({ page }) => {
  await open(page, "auth");
  await page.getByText("S'inscrire", { exact: true }).click();
  await page.getByLabel("Nom complet *").fill("Quelqu'un");
  await page.getByLabel("Email *").fill(SEED.alice.email);
  await page.getByLabel("Mot de passe *").fill("TestPass-2026!");
  await page.getByLabel("Numéro WhatsApp *").fill("+243 970 000 000");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("alert")).toHaveText("Un compte existe déjà avec cet email. Connectez-vous.");
  await expect(page.getByRole("heading", { name: "Créer un compte" })).toBeVisible(); // still on the form
});

test("connexion puis déconnexion @desktop", async ({ page }) => {
  const user = await createUser();
  await login(page, user);

  await expect(page.getByRole("heading", { name: /Trouvez votre maison/ })).toBeVisible();
  // Phone: the links are behind the ☰ button. Computer: they are shown directly.
  const isPhone = test.info().project.name === "phone";
  const nav = page.locator("nav");
  await expect(page.getByRole("button", { name: "Ouvrir le menu" })).toHaveCount(isPhone ? 1 : 0);
  await expect(nav.getByRole("button", { name: "Mes annonces", exact: true })).toHaveCount(isPhone ? 0 : 1);
  await openMenu(page);
  await expect(nav.getByRole("button", { name: "Mes annonces", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Favoris", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Messages", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Admin", exact: true })).toHaveCount(0); // not an admin

  // Still logged in after a reload.
  await page.reload();
  await expect(await navButton(page, "Déconnexion")).toBeVisible();

  await clickNav(page, "Déconnexion");
  await expect(page.getByText("Déconnexion réussie.")).toBeVisible();
  await openMenu(page);
  await expect(nav.getByRole("button", { name: "Connexion", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Créer un compte", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Déconnexion", exact: true })).toHaveCount(0);
  const stored = await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes("auth-token")));
  expect(stored, "no session left in the browser").toEqual([]);
});

test("mauvais mot de passe : message clair, pas de connexion", async ({ page }) => {
  await open(page, "auth");
  await page.getByPlaceholder("votre@email.com").fill(SEED.alice.email);
  await page.getByPlaceholder("••••••••").fill("mauvais-mot-de-passe");
  await page.locator("form").getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("alert")).toHaveText("Email ou mot de passe incorrect.");
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible(); // still on the login form
});

test("l'admin voit le lien Admin", async ({ page }) => {
  await login(page, SEED.admin);
  await clickNav(page, "Admin");
  await expect(page.getByRole("heading", { name: /Panneau d'administration/ })).toBeVisible();
});
