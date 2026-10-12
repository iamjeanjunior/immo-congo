// Accounts: signup, login, logout.
import { test, expect, open, openMenu, clickNav, login, createUser, getProfile, db, uid, SEED } from "./helpers.js";

test("créer un compte : le profil est créé avec le nom et le WhatsApp @desktop", async ({ page }) => {
  const id = uid();
  const nom = `Jean Nouveau ${id}`;
  const email = `signup-${id}@example.com`;
  const whatsapp = "+243 970 123 456";

  await open(page, "auth");
  await page.getByText("S'inscrire", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Créer un compte" })).toBeVisible();
  await page.getByPlaceholder("Jean Dupont").fill(nom);
  await page.getByPlaceholder("votre@email.com").fill(email);
  await page.getByPlaceholder("••••••••").fill("TestPass-2026!");
  await page.getByPlaceholder("+243 XXX XXX XXX").fill(whatsapp);
  await page.getByRole("button", { name: "Créer mon compte" }).click();

  await expect(page.getByText(`Bienvenue, ${nom} !`)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Trouvez votre maison/ })).toBeVisible(); // back on the home page
  await openMenu(page);
  await expect(page.getByRole("button", { name: "Déconnexion" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Publier" })).toBeVisible();

  // In the database: the account and its profile (normal user, not verified).
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  const account = users.users.find(u => u.email === email);
  expect(account, "the account exists").toBeTruthy();
  expect(account.user_metadata).toMatchObject({ nom, whatsapp });
  const profile = await getProfile(account.id);
  expect(profile).toMatchObject({ nom, whatsapp, role: "user", verified: false });
});

test("connexion puis déconnexion @desktop", async ({ page }) => {
  const user = await createUser();
  await login(page, user);

  await expect(page.getByRole("heading", { name: /Trouvez votre maison/ })).toBeVisible();
  // Phone: the links are behind the ☰ button. Computer: they are shown directly.
  const isPhone = test.info().project.name === "phone";
  await expect(page.getByRole("button", { name: "Ouvrir le menu" })).toHaveCount(isPhone ? 1 : 0);
  await expect(page.getByRole("button", { name: "Mes annonces" })).toHaveCount(isPhone ? 0 : 1);
  await openMenu(page);
  await expect(page.getByRole("button", { name: "Mes annonces" })).toBeVisible();
  await expect(page.getByRole("button", { name: "♥ Favoris" })).toBeVisible();
  await expect(page.getByRole("button", { name: "💬 Messages" })).toBeVisible();
  await expect(page.getByRole("button", { name: "⚙️ Admin" })).toHaveCount(0); // not an admin

  // Still logged in after a reload.
  await page.reload();
  await openMenu(page);
  await expect(page.getByRole("button", { name: "Déconnexion" })).toBeVisible();

  await clickNav(page, "Déconnexion");
  await expect(page.getByText("Déconnexion réussie.")).toBeVisible();
  await openMenu(page);
  await expect(page.getByRole("button", { name: "Connexion" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Créer un compte" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Déconnexion" })).toHaveCount(0);
  const stored = await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes("auth-token")));
  expect(stored, "no session left in the browser").toEqual([]);
});

test("mauvais mot de passe : message clair, pas de connexion", async ({ page }) => {
  await open(page, "auth");
  await page.getByPlaceholder("votre@email.com").fill(SEED.alice.email);
  await page.getByPlaceholder("••••••••").fill("mauvais-mot-de-passe");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Email ou mot de passe incorrect.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible(); // still on the login form
});

test("l'admin voit le lien Admin", async ({ page }) => {
  await login(page, SEED.admin);
  await clickNav(page, "⚙️ Admin");
  await expect(page.getByRole("heading", { name: /Panneau d'administration/ })).toBeVisible();
});
