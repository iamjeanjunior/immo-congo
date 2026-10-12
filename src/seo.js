// Page addresses, titles and descriptions for Google and link previews.
// Shared by the site (src/App.jsx) and the Netlify Edge Functions (netlify/), so both always agree.
// Plain JavaScript only: no browser or Deno APIs here.

// The real site's address. Canonical links, the sitemap and link previews always point here
// (also from previews and tests). Change it here and in public/robots.txt when ImmoCongo gets its own domain.
export const SITE_URL = "https://immocongo-jandj.netlify.app";
export const SITE_NAME = "ImmoCongo";
export const DEFAULT_TITLE = "ImmoCongo – Maisons à louer au Katanga";
export const DEFAULT_DESCRIPTION = "Trouvez ou publiez des maisons à louer à Fungurume, Kolwezi, Lubumbashi et environs, au Katanga (RDC).";
export const LISTINGS_TITLE = "Toutes les annonces – Maisons à louer au Katanga | ImmoCongo";
export const LISTINGS_DESCRIPTION = "Toutes les maisons et appartements à louer à Fungurume, Kolwezi, Lubumbashi, Likasi et Kipushi. Prix, nombre de chambres et contact WhatsApp du propriétaire.";
export const HOME_HEADING = "Trouvez votre maison à Fungurume & environs";
// Picture shown when the home page or the listings page is shared (1200 × 630).
export const SHARE_IMAGE = `${SITE_URL}/og-image.png`;

// App page name → address. Detail ("/annonce/12-maison-...") and chat ("/messages/5") are built below.
export const PAGE_PATHS = {
  home: "/",
  listings: "/annonces",
  auth: "/connexion",
  post: "/publier",
  favorites: "/favoris",
  messages: "/messages",
  "my-listings": "/mes-annonces",
  admin: "/admin",
};

// Members-only pages: never in Google (noindex here, X-Robots-Tag in netlify.toml, Disallow in robots.txt).
export const PRIVATE_PAGES = ["auth", "post", "favorites", "messages", "chat", "my-listings", "admin"];

const PAGE_TITLES = {
  auth: "Connexion",
  post: "Publier une annonce",
  favorites: "Mes favoris",
  messages: "Messages",
  chat: "Conversation",
  "my-listings": "Mes annonces",
  admin: "Administration",
};

const CURRENCY_SYMBOLS = { USD: "$", CDF: "FC", EUR: "€", ZAR: "R", ZMW: "K" };

// "Maison 2 chambres – Fungurume!" → "maison-2-chambres-fungurume"
export function slugify(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // accents: "é" → "e"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Title + town, at most about 60 characters, cut at a dash.
export function listingSlug(listing) {
  const title = slugify(listing?.titre);
  const town = slugify(listing?.ville);
  let slug = town && !`-${title}-`.includes(`-${town}-`) ? [title, town].filter(Boolean).join("-") : title;
  if (slug.length > 60) slug = slug.slice(0, 60).replace(/-[^-]*$/, "") || slug.slice(0, 60);
  return slug.replace(/-+$/, "");
}

export function listingPath(listing) {
  const slug = listingSlug(listing);
  return `/annonce/${listing.id}${slug ? `-${slug}` : ""}`;
}

// Address of an app page. `listing` (optional) adds the readable part to a listing's address.
export function pagePath(page, id = null, listing = null) {
  if (page === "detail") return listing && String(listing.id) === String(id) ? listingPath(listing) : `/annonce/${id}`;
  if (page === "chat") return `/messages/${id}`;
  return PAGE_PATHS[page] || "/";
}

function toId(raw) {
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}

// "/annonce/12-maison-..." → { page: "detail", id: 12 }. Unknown addresses → null.
export function routeFromPath(pathname) {
  const path = String(pathname || "/").replace(/\/+$/, "") || "/";
  if (path === "/") return { page: "home", id: null };
  let m = path.match(/^\/annonce\/(\d+)(?:-[^/]*)?$/);
  if (m) return { page: "detail", id: Number(m[1]) };
  m = path.match(/^\/messages\/([^/]+)$/);
  if (m) return { page: "chat", id: toId(decodeURIComponent(m[1])) };
  const page = Object.keys(PAGE_PATHS).find(p => PAGE_PATHS[p] === path);
  return page ? { page, id: null } : null;
}

// Old links shared before 2026-10 used "#/listing/12", "#/chat/5", "#/listings"... → { page, id } or null.
// Anything else after "#" (for example Supabase login links) is not ours: null.
export function routeFromLegacyHash(hash) {
  const h = String(hash || "");
  if (!h.startsWith("#/")) return null;
  const [seg, idRaw] = h.slice(2).split(/[/?]/);
  if (!seg) return { page: "home", id: null };
  if (seg === "listing" && idRaw) return { page: "detail", id: toId(idRaw) };
  if (seg === "chat" && idRaw) return { page: "chat", id: toId(idRaw) };
  if (PAGE_PATHS[seg]) return { page: seg, id: null };
  return { page: "home", id: null };
}

const NBSP = String.fromCharCode(160); // no line break inside a price

// "1 200 $", "200 000 FC" (French spacing).
export function formatPrice(amount, devise) {
  const n = Number(amount) || 0;
  const [int, dec] = (Number.isInteger(n) ? String(n) : n.toFixed(2)).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${grouped}${dec ? `,${dec}` : ""}${NBSP}${CURRENCY_SYMBOLS[devise] || devise || "$"}`;
}

export function roomsText(chambres) {
  const n = Number(chambres) || 0;
  if (n <= 0) return "";
  return `${n} chambre${n > 1 ? "s" : ""}`;
}

function clip(text, max) {
  // Only ordinary spaces and line breaks: the no-break spaces inside prices stay.
  const t = String(text || "").replace(/[ \t\r\n]+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).replace(/ [^ ]*$/, "")}…`;
}

// "Maison 2 chambres – Fungurume"
export function listingHeadline(listing) {
  const title = String(listing.titre || "Annonce").trim();
  const town = String(listing.ville || "").trim();
  return town && !title.toLowerCase().includes(town.toLowerCase()) ? `${title} – ${town}` : title;
}

// "À louer à Fungurume (Quartier Gécamines) : 450 $ par mois, 2 chambres. Grande maison avec cour..."
export function listingDescription(listing, max = 160) {
  const where = [listing.ville && `à ${listing.ville}`, listing.localisation && `(${String(listing.localisation).trim()})`].filter(Boolean).join(" ");
  const facts = [`${formatPrice(listing.prix, listing.devise)} par mois`, roomsText(listing.chambres)].filter(Boolean).join(", ");
  const lead = listing.disponible === false ? "Actuellement occupée. Location" : "À louer";
  const intro = `${lead}${where ? ` ${where}` : ""} : ${facts}.`;
  return clip(`${intro} ${listing.description || ""}`, max);
}

// Title, description, canonical address and robots rule of a page.
// `listing` is the listing of a detail page (undefined while loading, null when it doesn't exist).
export function pageMeta(page, listing) {
  if (page === "detail") {
    if (!listing) {
      return { title: `Annonce introuvable | ${SITE_NAME}`, description: DEFAULT_DESCRIPTION, path: null, noindex: true };
    }
    return { title: `${listingHeadline(listing)} | ${SITE_NAME}`, description: listingDescription(listing), path: listingPath(listing), noindex: false };
  }
  if (page === "listings") return { title: LISTINGS_TITLE, description: LISTINGS_DESCRIPTION, path: PAGE_PATHS.listings, noindex: false };
  if (PRIVATE_PAGES.includes(page)) {
    return { title: `${PAGE_TITLES[page]} | ${SITE_NAME}`, description: DEFAULT_DESCRIPTION, path: null, noindex: true };
  }
  return { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, path: "/", noindex: false };
}

// Photos of a listing that can be used in previews (web addresses only, not old base64 photos).
export function listingImageUrls(listing) {
  let list = [];
  try {
    const parsed = typeof listing.images === "string" ? JSON.parse(listing.images) : listing.images;
    if (Array.isArray(parsed)) list = parsed;
  } catch {
    list = [];
  }
  return [listing.image_url, ...list].filter((u, i, all) => typeof u === "string" && /^https?:\/\//.test(u) && all.indexOf(u) === i);
}
