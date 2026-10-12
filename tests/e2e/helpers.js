// Shared helpers for the automatic tests. LOCAL Supabase only (checked in local-supabase.mjs).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localSupabaseEnv, assertLocalUrl } from "../../scripts/e2e/local-supabase.mjs";

export { expect };

const env = localSupabaseEnv();
assertLocalUrl(env.url);
export const SUPABASE_URL = env.url;
export const BUCKET = "listing-photos";
export const PUBLIC_PHOTO_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

const here = path.dirname(fileURLToPath(import.meta.url));
export const fixture = name => path.join(here, "fixtures", name);

// Local test password for every test account (same as supabase/seed.sql). Not a real password.
export const PASSWORD = "TestPass-2026!";

// Accounts created by supabase/seed.sql. Only use them for things that don't change them,
// except where a test says otherwise (Bruno in listings.spec.js).
export const SEED = {
  admin: { id: "11111111-1111-4111-8111-111111111111", email: "admin@example.com", nom: "Admin Test", whatsapp: "+243 900 000 001", password: PASSWORD },
  alice: { id: "22222222-2222-4222-8222-222222222222", email: "alice@example.com", nom: "Alice Proprio", whatsapp: "+243 900 000 002", password: PASSWORD },
  bruno: { id: "33333333-3333-4333-8333-333333333333", email: "bruno@example.com", nom: "Bruno Sansprofil", whatsapp: "+243 900 000 003", password: PASSWORD },
};

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

// Service-role client: bypasses RLS, used to prepare data and to check results.
export const db = createClient(SUPABASE_URL, env.serviceRoleKey, noSession);

export function anonClient() {
  return createClient(SUPABASE_URL, env.anonKey, noSession);
}

// A supabase-js client signed in as `user` (goes through RLS like the website does).
export async function clientAs(user) {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password || PASSWORD });
  if (error) throw new Error(`sign in as ${user.email} failed: ${error.message}`);
  return client;
}

export function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// A new account (its profile is created by the on_auth_user_created trigger, like on the real site).
export async function createUser({ nom, whatsapp, withProfile = true } = {}) {
  const id = uid();
  const user = {
    email: `e2e-${id}@example.com`,
    password: PASSWORD,
    nom: nom || `Testeur ${id}`,
    whatsapp: whatsapp || `+243 81 ${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
  };
  const { data, error } = await db.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { nom: user.nom, whatsapp: user.whatsapp },
  });
  if (error) throw error;
  user.id = data.user.id;
  if (!withProfile) {
    const { error: delError } = await db.from("profiles").delete().eq("id", user.id);
    if (delError) throw delError;
  }
  return user;
}

// Uploads fixture photos into the owner's Storage folder (as the owner) and returns their public URLs.
export async function uploadPhotos(owner, names, client) {
  const c = client || await clientAs(owner);
  const urls = [];
  for (const name of names) {
    const ext = path.extname(name).slice(1).toLowerCase();
    const contentType = ext === "png" ? "image/png" : "image/jpeg";
    const filePath = `${owner.id}/${uid()}.${ext === "png" ? "png" : "jpg"}`;
    const { error } = await c.storage.from(BUCKET).upload(filePath, fs.readFileSync(fixture(name)), { contentType });
    if (error) throw new Error(`upload ${name}: ${error.message}`);
    urls.push(c.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl);
  }
  return urls;
}

// A listing owned by `owner`, created the way the site does it (as the owner, through RLS).
export async function createListing(owner, { photos = [], ...fields } = {}) {
  const c = await clientAs(owner);
  const urls = await uploadPhotos(owner, photos, c);
  const row = {
    titre: `Annonce test ${uid()}`,
    prix: 450,
    devise: "USD",
    localisation: "Quartier Test, rue 1",
    ville: "Fungurume",
    chambres: 2,
    description: "Annonce créée par les tests automatiques.",
    whatsapp: owner.whatsapp,
    disponible: true,
    image_url: urls[0] || null,
    images: JSON.stringify(urls),
    owner_id: owner.id,
    owner_name: owner.nom,
    ...fields,
  };
  const { data, error } = await c.from("listings").insert(row).select().single();
  if (error) throw new Error(`create listing: ${error.message}`);
  return { ...data, photoUrls: urls };
}

export async function getListing(id) {
  const { data, error } = await db.from("listings").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getProfile(id) {
  const { data, error } = await db.from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

// Files in a user's Storage folder: [{ name, metadata: { size, mimetype } }].
export async function listPhotoFiles(userId) {
  const { data, error } = await db.storage.from(BUCKET).list(userId, { limit: 100 });
  if (error) throw error;
  return (data || []).filter(f => f.id); // folders have no id
}

export function storagePath(url) {
  return decodeURIComponent(url.slice(url.indexOf(`/${BUCKET}/`) + BUCKET.length + 2).split("?")[0]);
}

// Opens a page of the site with a fresh load (so it reads the latest data from the database).
export async function open(page, route = "") {
  await page.goto("about:blank");
  await page.goto(`/#/${route}`);
}

// The ☰ menu: on phones the links are hidden until it is opened.
export async function openMenu(page) {
  const burger = page.getByRole("button", { name: "Ouvrir le menu" });
  if (await burger.isVisible() && (await burger.getAttribute("aria-expanded")) !== "true") await burger.click();
}

export async function clickNav(page, name) {
  await openMenu(page);
  await page.locator("nav").getByRole("button", { name, exact: true }).click();
}

// A link or button of the header menu (opens the ☰ menu on phones first).
export async function navButton(page, name) {
  await openMenu(page);
  return page.locator("nav").getByRole("button", { name, exact: true });
}

// The site's own confirmation window (it replaced the browser's confirm()).
export const confirmDialog = page => page.getByRole("alertdialog");

// Clicks a "Supprimer" button, then answers the site's confirmation window with "Supprimer".
export async function deleteAndConfirm(page, button) {
  await button.click();
  const dialog = confirmDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

// Listings page: on phones the filters are behind the "Filtres" button.
export async function openFilters(page) {
  const toggle = page.getByRole("button", { name: /^Filtres/ });
  if (await toggle.isVisible() && (await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}

export async function login(page, user) {
  await open(page, "auth");
  await page.getByPlaceholder("votre@email.com").fill(user.email);
  await page.getByPlaceholder("••••••••").fill(user.password || PASSWORD);
  await page.locator("form").getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Connexion réussie !")).toBeVisible();
}

// The page must not scroll sideways (nothing wider than the screen).
export async function expectNoSideScroll(page, label = "") {
  const size = await page.evaluate(() => ({
    content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    screen: document.documentElement.clientWidth,
  }));
  expect(size.content, `${label}: page is ${size.content}px wide on a ${size.screen}px screen`).toBeLessThanOrEqual(size.screen);
}

// Resolves when the chat page's live connection (Supabase Realtime) is ready to receive new messages.
export function waitForLiveChat(page) {
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("live chat (Realtime) did not connect within 15 s")), 15_000);
    page.on("websocket", ws => {
      ws.on("framereceived", ({ payload }) => {
        const text = typeof payload === "string" ? payload : payload.toString();
        if (text.includes("Subscribed to PostgreSQL")) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  });
  ready.catch(() => {}); // the test awaits it; this only avoids an "unhandled rejection" if the test stopped earlier
  return ready;
}

// Every page in a test may only talk to this computer: anything else (production Supabase,
// Google Maps, Google Fonts) is blocked. This keeps the tests fast, offline-proof and safe.
const LOCAL = ["127.0.0.1", "localhost", "[::1]"];
const isRemote = url => (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "ws:" || url.protocol === "wss:") && !LOCAL.includes(url.hostname);

export async function onlyLocalRequests(context) {
  await context.route(isRemote, route => route.abort("blockedbyclient"));
  await context.routeWebSocket(isRemote, ws => ws.close());
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await onlyLocalRequests(context);
    await use(context);
  },
  // The site must never open the browser's own pop-ups (alert / confirm / prompt): on phones they show
  // the website address and English buttons. Any test whose page opens one fails.
  page: async ({ page }, use) => {
    const nativeDialogs = [];
    page.on("dialog", dialog => {
      nativeDialogs.push(`${dialog.type()}: ${dialog.message()}`);
      dialog.dismiss().catch(() => {});
    });
    await use(page);
    expect(nativeDialogs, "the browser's own pop-up must never open").toEqual([]);
  },
});
