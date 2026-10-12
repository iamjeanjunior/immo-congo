// The Netlify Edge Functions (link previews on WhatsApp/Facebook, Google tags, sitemap.xml), tested in Node
// with FAKE data: a fake Supabase (fetchImpl) and the site's own index.html. Nothing here uses the internet.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { renderSeoPage, renderSitemapResponse, injectSeo, buildSeo } from "../../netlify/seo-page.js";
import { config as pagesConfig } from "../../netlify/edge-functions/seo-pages.js";
import { config as sitemapConfig } from "../../netlify/edge-functions/sitemap.js";
import { SITE_URL } from "../../src/seo.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const INDEX_HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const SUPABASE = "https://fake-project.supabase.test";
const ANON = "fake-anon-key";
const NBSP = String.fromCharCode(160);

const LISTING = {
  id: 12,
  titre: "Maison 2 chambres",
  prix: 1200,
  devise: "USD",
  ville: "Fungurume",
  localisation: "Quartier Gécamines, rue 4",
  chambres: 2,
  disponible: true,
  description: "Belle maison avec cour, eau et électricité.",
  image_url: "https://fake-project.supabase.test/storage/v1/object/public/listing-photos/a/1.jpg",
  images: JSON.stringify(["https://fake-project.supabase.test/storage/v1/object/public/listing-photos/a/1.jpg", "https://fake-project.supabase.test/storage/v1/object/public/listing-photos/a/2.jpg"]),
  created_at: "2026-10-10T08:30:00.123456",
};
const CANONICAL_PATH = "/annonce/12-maison-2-chambres-fungurume";

// A fake Supabase REST: answers `rows` (or does what `behave` says) and remembers what was asked.
function fakeSupabase(rows, behave) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), headers: init?.headers || {} });
    if (!String(url).startsWith(SUPABASE)) throw new Error(`unexpected request to ${url}`);
    if (behave === "down") throw new TypeError("fetch failed");
    if (behave === "error") return new Response("{}", { status: 500 });
    if (behave === "slow") {
      return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
    }
    return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetchImpl, calls };
}

const htmlPage = () => new Response(INDEX_HTML, { status: 200, headers: { "content-type": "text/html; charset=UTF-8", etag: '"abc"' } });

async function render(pathname, rows, behave, extra = {}) {
  const supa = fakeSupabase(rows, behave);
  const res = await renderSeoPage({
    request: new Request(`https://preview--immocongo.example${pathname}`, { method: extra.method || "GET" }),
    next: async () => htmlPage(),
    supabaseUrl: SUPABASE,
    anonKey: ANON,
    fetchImpl: supa.fetchImpl,
    timeoutMs: extra.timeoutMs,
  });
  return { res, calls: supa.calls };
}

// All <meta property|name="key" content="..."> values of a page (HTML entities decoded).
function metas(html, key) {
  const out = [];
  const re = /<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"\s*\/?>/g;
  for (const m of html.matchAll(re)) {
    if (m[1] === key) out.push(m[2].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
  }
  return out;
}
const jsonLd = html => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

test("aperçu d'une annonce : titre, description, Open Graph, JSON-LD et texte", async () => {
  const { res, calls } = await render(CANONICAL_PATH, [LISTING]);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  expect(res.headers.get("etag"), "the page changed, so the old etag must go").toBeNull();
  const html = await res.text();

  // Asked Supabase for this listing only, with the public key.
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toContain(`${SUPABASE}/rest/v1/listings?`);
  expect(calls[0].url).toContain("id=eq.12");
  expect(calls[0].headers.apikey).toBe(ANON);

  expect(html).toContain("<title>Maison 2 chambres – Fungurume | ImmoCongo</title>");
  const description = metas(html, "description");
  expect(description).toHaveLength(1);
  expect(description[0]).toContain(`1${NBSP}200${NBSP}$ par mois`);
  expect(description[0]).toContain("Fungurume");
  expect(description[0]).toContain("2 chambres");
  expect(html).toContain(`<link rel="canonical" href="${SITE_URL}${CANONICAL_PATH}" />`);
  expect(html).not.toContain('name="robots"');

  // Open Graph + Twitter: each tag once (the generic ones of index.html are replaced).
  expect(metas(html, "og:title")).toEqual(["Maison 2 chambres – Fungurume"]);
  expect(metas(html, "og:description")).toEqual(description);
  expect(metas(html, "og:image")).toEqual([LISTING.image_url]);
  expect(metas(html, "og:url")).toEqual([SITE_URL + CANONICAL_PATH]);
  expect(metas(html, "og:image:width")).toEqual([]); // the generic picture's size must not stay
  expect(metas(html, "twitter:card")).toEqual(["summary_large_image"]);
  expect(metas(html, "twitter:image")).toEqual([LISTING.image_url]);

  const data = jsonLd(html);
  expect(data["@type"]).toBe("RealEstateListing");
  expect(data.url).toBe(SITE_URL + CANONICAL_PATH);
  expect(data.datePosted).toBe("2026-10-10");
  expect(data.image).toHaveLength(2);
  expect(data.offers).toMatchObject({ price: 1200, priceCurrency: "USD", availability: "https://schema.org/InStock" });
  expect(data.about).toMatchObject({ "@type": "Accommodation", numberOfBedrooms: 2, address: { addressLocality: "Fungurume", addressCountry: "CD" } });

  // The same content visitors see, as text inside the app's root (the app replaces it when it starts).
  const root = html.match(/<div id="root">([\s\S]*?)<\/div>\s*<script/)[1];
  expect(root).toContain("<h1>Maison 2 chambres</h1>");
  expect(root).toContain("Belle maison avec cour");
  expect(root).toContain("Quartier Gécamines, rue 4");
  expect(root).toContain(`href="/annonces"`);
});

test("aperçu : texte dangereux échappé, annonce occupée, sans photo", async () => {
  const evil = { ...LISTING, titre: 'Villa "luxe" <script>alert(1)</script> ', description: "</script><b>x</b>", disponible: false, image_url: null, images: "[]" };
  const seo = buildSeo({ page: "detail", id: 12 }, [evil], "/annonce/12-villa-luxe-script-alert-1-script-fungurume");
  expect(seo.redirect).toBeUndefined();
  const html = injectSeo(INDEX_HTML, seo);
  expect(html).not.toContain("<script>alert(1)");
  expect(html).not.toContain("<b>x</b>");
  expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(jsonLd(html).name).toBe(evil.titre.trim()); // JSON-LD stays valid and exact (extra spaces trimmed)
  expect(jsonLd(html).offers.availability).toBe("https://schema.org/OutOfStock");
  expect(metas(html, "og:image")).toEqual([`${SITE_URL}/og-image.png`]); // no photo: the site's picture
  expect(metas(html, "description")[0]).toMatch(/^Actuellement occupée\./);
});

test("aperçu : ancienne ou courte adresse → redirigée vers la vraie adresse", async () => {
  for (const old of ["/annonce/12", "/annonce/12-ancien-titre", "/annonce/12-maison-2-chambres-fungurume/"]) {
    const { res } = await render(`${old}?utm=wa`, [LISTING]);
    expect(res.status, old).toBe(301);
    expect(res.headers.get("location")).toBe(`${CANONICAL_PATH}?utm=wa`);
  }
});

test("aperçu : annonce supprimée → page 404 noindex", async () => {
  const { res } = await render("/annonce/999-maison", []);
  expect(res.status).toBe(404);
  const html = await res.text();
  expect(html).toContain("<title>Annonce introuvable | ImmoCongo</title>");
  expect(html).toContain('<meta name="robots" content="noindex" />');
  expect(html).not.toContain('rel="canonical"');
  expect(html).toContain("Annonce introuvable");
});

test("aperçu : Supabase en panne, en erreur ou trop lent → page normale, vite", async () => {
  for (const behave of ["down", "error", "slow"]) {
    const started = Date.now();
    const { res } = await render(CANONICAL_PATH, [LISTING], behave, { timeoutMs: 100 });
    expect(Date.now() - started, behave).toBeLessThan(1000);
    expect(res.status, behave).toBe(200);
    expect(await res.text(), behave).toBe(INDEX_HTML);
  }
});

test("aperçu : rien à faire pour les autres pages et demandes", async () => {
  expect((await render("/connexion", [LISTING])).res).toBeUndefined();
  expect((await render("/annonce/abc", [LISTING])).res).toBeUndefined();
  expect((await render("/", [LISTING], null, { method: "POST" })).res).toBeUndefined();
  const missingEnv = await renderSeoPage({ request: new Request("https://x.example/"), next: async () => htmlPage(), supabaseUrl: "", anonKey: "" });
  expect(missingEnv).toBeUndefined();
  // A page that isn't HTML passes through untouched.
  const res = await renderSeoPage({
    request: new Request("https://x.example/annonces"), supabaseUrl: SUPABASE, anonKey: ANON,
    fetchImpl: fakeSupabase([LISTING]).fetchImpl,
    next: async () => new Response("not html", { headers: { "content-type": "text/plain" } }),
  });
  expect(await res.text()).toBe("not html");
});

test("aperçu : accueil et liste des annonces", async () => {
  const other = { ...LISTING, id: 13, titre: "Studio meublé", ville: "Kolwezi", chambres: 1, prix: 200000, devise: "CDF", disponible: false };
  const home = await render("/", [LISTING, other]);
  expect(home.calls[0].url).toContain("limit=6");
  const homeHtml = await home.res.text();
  expect(homeHtml).toContain("<title>ImmoCongo – Maisons à louer au Katanga</title>");
  expect(homeHtml).toContain(`<link rel="canonical" href="${SITE_URL}/" />`);
  expect(metas(homeHtml, "og:image")).toEqual([`${SITE_URL}/og-image.png`]);
  expect(metas(homeHtml, "og:image:width")).toEqual(["1200"]);
  expect(jsonLd(homeHtml)["@type"]).toBe("WebSite");
  expect(homeHtml).toContain(`<a href="${CANONICAL_PATH}">Maison 2 chambres</a>`);
  expect(homeHtml).toContain(`<a href="/annonce/13-studio-meuble-kolwezi">Studio meublé</a> – 200${NBSP}000${NBSP}FC/mois · Kolwezi · 1 chambre · Occupée`);

  const list = await render("/annonces", [LISTING, other]);
  const listHtml = await list.res.text();
  expect(listHtml).toContain(`<link rel="canonical" href="${SITE_URL}/annonces" />`);
  expect(listHtml).toMatch(/<title>[^<]*annonces[^<]*\| ImmoCongo<\/title>/i);
  const data = jsonLd(listHtml);
  expect(data["@type"]).toBe("CollectionPage");
  expect(data.mainEntity.itemListElement.map(i => i.url)).toEqual([SITE_URL + CANONICAL_PATH, `${SITE_URL}/annonce/13-studio-meuble-kolwezi`]);
});

test("sitemap.xml : accueil, annonces et chaque annonce disponible", async () => {
  const supa = fakeSupabase([LISTING, { id: 7, titre: "Villa avec jardin", ville: "Kolwezi", created_at: "2026-09-01T10:00:00" }]);
  const res = await renderSitemapResponse({ supabaseUrl: SUPABASE, anonKey: ANON, fetchImpl: supa.fetchImpl });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/xml");
  expect(supa.calls[0].url).toContain("disponible=eq.true");
  const xml = await res.text();
  expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  expect(locs).toEqual([`${SITE_URL}/`, `${SITE_URL}/annonces`, SITE_URL + CANONICAL_PATH, `${SITE_URL}/annonce/7-villa-avec-jardin-kolwezi`]);
  const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(m => m[1]);
  expect(lastmods).toEqual(["2026-10-10", "2026-10-10", "2026-10-10", "2026-09-01"]);

  // Supabase down: still a valid sitemap with the two main pages.
  const down = await renderSitemapResponse({ supabaseUrl: SUPABASE, anonKey: ANON, fetchImpl: fakeSupabase([], "down").fetchImpl });
  const downLocs = [...(await down.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  expect(downLocs).toEqual([`${SITE_URL}/`, `${SITE_URL}/annonces`]);
});

test("réglages Netlify : chemins des Edge Functions, robots.txt, retour vers l'app", async () => {
  expect(pagesConfig.path).toEqual(["/", "/annonces", "/annonce/*"]);
  expect(pagesConfig.onError).toBe("bypass");
  expect(sitemapConfig.path).toBe("/sitemap.xml");
  const robots = fs.readFileSync(path.join(ROOT, "public", "robots.txt"), "utf8");
  for (const p of ["/connexion", "/publier", "/favoris", "/messages", "/mes-annonces", "/admin"]) expect(robots).toContain(`Disallow: ${p}\n`);
  expect(robots).not.toMatch(/Disallow: \/\s*$/m); // never block the whole site
  expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  const toml = fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
  expect(toml).toMatch(/from = "\/\*"\s+to = "\/index.html"\s+status = 200/);
  expect(toml).not.toContain("force"); // real files (Google verification file...) must win over the fallback
  expect(fs.existsSync(path.join(ROOT, "public", "googlebd90416f13600b98.html"))).toBe(true);
  expect(fs.existsSync(path.join(ROOT, "public", "og-image.png"))).toBe(true);
});
