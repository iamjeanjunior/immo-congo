// Server side of "Google basics" and link previews, used by the Netlify Edge Functions in
// netlify/edge-functions/. WhatsApp, Facebook and some search engines don't run JavaScript, so for the home
// page, the listings page and every listing page we put the title, description, preview tags (Open Graph,
// Twitter), structured data (JSON-LD) and a short text version of the page straight into the HTML.
// The text is the same content visitors see; the app replaces it as soon as it starts.
// If anything goes wrong (Supabase slow or down, unexpected page), the plain page is served unchanged.
// Plain JavaScript (fetch, URL, Response): runs in Netlify's Deno runtime and in Node for the tests.
import {
  SITE_URL, SITE_NAME, DEFAULT_DESCRIPTION, LISTINGS_DESCRIPTION, HOME_HEADING, SHARE_IMAGE, PAGE_PATHS,
  pageMeta, routeFromPath, listingPath, listingHeadline, listingImageUrls, formatPrice, roomsText,
} from "../src/seo.js";

const LIST_FIELDS = "id,titre,prix,devise,ville,localisation,chambres,disponible,image_url,created_at";
const DETAIL_FIELDS = `${LIST_FIELDS},description,images`;
export const HOME_COUNT = 6; // the home page shows the 6 newest listings
export const LISTINGS_COUNT = 60;
export const PAGE_TIMEOUT_MS = 1500;
export const SITEMAP_TIMEOUT_MS = 5000;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const jsonForHtml = obj => JSON.stringify(obj).replace(/</g, "\\u003c");

// Listings from Supabase REST with the public (anon) key. Throws on any problem, including a slow answer.
export async function fetchListings(query, { supabaseUrl, anonKey, fetchImpl = fetch, timeoutMs = PAGE_TIMEOUT_MS }) {
  const res = await fetchImpl(`${String(supabaseUrl).replace(/\/+$/, "")}/rest/v1/listings?${query}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Supabase answered ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error("Supabase answer is not a list");
  return rows;
}

// Which pages get the treatment: home, listings, one listing. Anything else → null.
export function seoRoute(pathname) {
  const route = routeFromPath(pathname);
  return route && ["home", "listings", "detail"].includes(route.page) ? route : null;
}

export function queryFor(route) {
  if (route.page === "detail") return `select=${DETAIL_FIELDS}&id=eq.${route.id}&limit=1`;
  const limit = route.page === "home" ? HOME_COUNT : LISTINGS_COUNT;
  return `select=${LIST_FIELDS}&order=created_at.desc&limit=${limit}`;
}

const SUMMARY_STYLE = "max-width:760px;margin:0 auto;padding:24px 16px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;line-height:1.5;color:#14213d";

function listingLine(l) {
  const facts = [`${formatPrice(l.prix, l.devise)}/mois`, l.ville, roomsText(l.chambres), l.disponible === false ? "Occupée" : "Disponible"].filter(Boolean);
  return `<li><a href="${esc(listingPath(l))}">${esc(l.titre)}</a> – ${esc(facts.join(" · "))}</li>`;
}

function summary(inner) {
  return `<main data-seo-summary style="${SUMMARY_STYLE}">${inner}</main>`;
}

const crumbs = `<p><a href="/">${SITE_NAME}</a> › <a href="${PAGE_PATHS.listings}">Annonces</a></p>`;

// Everything the page needs: { status, title, description, canonical, noindex, image, imageAlt, imageSize, jsonLd, body }
// or { redirect } when a listing is opened with an outdated address.
export function buildSeo(route, rawRows, pathname) {
  // Owners sometimes type a space at the end of a title or description.
  const rows = rawRows.map(r => ({ ...r, titre: String(r.titre ?? "").trim(), description: String(r.description ?? "").trim() }));
  if (route.page === "detail") {
    const listing = rows[0];
    if (!listing) {
      const meta = pageMeta("detail", null);
      return {
        status: 404, title: meta.title, description: meta.description, canonical: null, noindex: true,
        image: SHARE_IMAGE, imageAlt: SITE_NAME, imageSize: [1200, 630], jsonLd: null,
        body: summary(`${crumbs}<h1>Annonce introuvable</h1><p>Cette annonce n'existe pas ou a été supprimée.</p><p><a href="${PAGE_PATHS.listings}">Voir toutes les annonces</a></p>`),
      };
    }
    const path = listingPath(listing);
    if (pathname !== path) return { redirect: path };
    const meta = pageMeta("detail", listing);
    const canonical = SITE_URL + path;
    const photos = listingImageUrls(listing);
    const prix = Number(listing.prix) || 0;
    const devise = listing.devise || "USD";
    const facts = [`${formatPrice(prix, devise)}/mois`, listing.ville, roomsText(listing.chambres), listing.disponible === false ? "Occupée" : "Disponible"].filter(Boolean);
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      name: listing.titre,
      description: listing.description || meta.description,
      url: canonical,
      inLanguage: "fr",
      ...(listing.created_at ? { datePosted: String(listing.created_at).slice(0, 10) } : {}),
      ...(photos.length ? { image: photos } : {}),
      offers: {
        "@type": "Offer",
        price: prix,
        priceCurrency: devise,
        businessFunction: "http://purl.org/goodrelations/v1#LeaseOut",
        availability: listing.disponible === false ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
        priceSpecification: { "@type": "UnitPriceSpecification", price: prix, priceCurrency: devise, unitCode: "MON" },
      },
      about: {
        "@type": "Accommodation",
        name: listing.titre,
        ...(Number(listing.chambres) > 0 ? { numberOfBedrooms: Number(listing.chambres) } : {}),
        address: {
          "@type": "PostalAddress",
          ...(listing.localisation ? { streetAddress: listing.localisation } : {}),
          addressLocality: listing.ville,
          addressCountry: "CD",
        },
      },
    };
    return {
      status: 200, title: meta.title, description: meta.description, canonical, noindex: false,
      ogTitle: listingHeadline(listing),
      image: photos[0] || SHARE_IMAGE, imageAlt: listing.titre, imageSize: photos[0] ? null : [1200, 630],
      jsonLd,
      body: summary(`${crumbs}<h1>${esc(listing.titre)}</h1><p><strong>${esc(facts.join(" · "))}</strong></p>`
        + `${listing.localisation ? `<p>${esc(listing.localisation)}, ${esc(listing.ville)}</p>` : ""}`
        + `${listing.description ? `<p>${esc(listing.description)}</p>` : ""}`),
    };
  }

  const meta = pageMeta(route.page);
  const canonical = SITE_URL + meta.path;
  const items = rows.map(listingLine).join("");
  const list = items ? `<ul>${items}</ul>` : "<p>Aucune annonce pour le moment.</p>";
  if (route.page === "listings") {
    return {
      status: 200, title: meta.title, description: meta.description, canonical, noindex: false,
      image: SHARE_IMAGE, imageAlt: SITE_NAME, imageSize: [1200, 630],
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Annonces",
        description: LISTINGS_DESCRIPTION,
        url: canonical,
        inLanguage: "fr",
        mainEntity: {
          "@type": "ItemList",
          itemListElement: rows.map((l, i) => ({ "@type": "ListItem", position: i + 1, url: SITE_URL + listingPath(l), name: l.titre })),
        },
      },
      body: summary(`<p><a href="/">${SITE_NAME}</a></p><h1>Annonces</h1><p>${esc(LISTINGS_DESCRIPTION)}</p>${list}`),
    };
  }
  return {
    status: 200, title: meta.title, description: meta.description, canonical, noindex: false,
    image: SHARE_IMAGE, imageAlt: SITE_NAME, imageSize: [1200, 630],
    jsonLd: { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: `${SITE_URL}/`, description: DEFAULT_DESCRIPTION, inLanguage: "fr" },
    body: summary(`<h1>${esc(HOME_HEADING)}</h1><p>La plateforme de location immobilière du Katanga. ${esc(DEFAULT_DESCRIPTION)}</p>`
      + `<h2>Annonces récentes</h2>${list}<p><a href="${PAGE_PATHS.listings}">Voir toutes les annonces</a></p>`),
  };
}

function headTags(seo) {
  const tags = [];
  if (seo.canonical) tags.push(`<link rel="canonical" href="${esc(seo.canonical)}" />`);
  if (seo.noindex) tags.push('<meta name="robots" content="noindex" />');
  const og = {
    "og:site_name": SITE_NAME,
    "og:locale": "fr_FR",
    "og:type": "website",
    "og:title": seo.ogTitle || seo.title,
    "og:description": seo.description,
    "og:url": seo.canonical || "",
    "og:image": seo.image,
    "og:image:alt": seo.imageAlt,
    "og:image:width": seo.imageSize ? seo.imageSize[0] : "",
    "og:image:height": seo.imageSize ? seo.imageSize[1] : "",
  };
  for (const [property, content] of Object.entries(og)) {
    if (content !== "" && content != null) tags.push(`<meta property="${property}" content="${esc(content)}" />`);
  }
  const twitter = {
    "twitter:card": "summary_large_image",
    "twitter:title": seo.ogTitle || seo.title,
    "twitter:description": seo.description,
    "twitter:image": seo.image,
  };
  for (const [name, content] of Object.entries(twitter)) tags.push(`<meta name="${name}" content="${esc(content)}" />`);
  if (seo.jsonLd) tags.push(`<script type="application/ld+json">${jsonForHtml(seo.jsonLd)}</script>`);
  return tags.join("\n    ");
}

// Puts the page's tags and text into the app's index.html. Throws if the HTML isn't the one we expect.
export function injectSeo(html, seo) {
  if (!/<title>[\s\S]*?<\/title>/.test(html) || !html.includes("</head>") || !/<div id="root">\s*<\/div>/.test(html)) {
    throw new Error("unexpected HTML");
  }
  return html
    // remove the generic tags of index.html that this page replaces
    .replace(/[ \t]*<meta\s+(?:property|name)="(?:og|twitter):[^"]*"[^>]*>\s*/g, "")
    .replace(/[ \t]*<link\s+rel="canonical"[^>]*>\s*/g, "")
    .replace(/[ \t]*<meta\s+name="robots"[^>]*>\s*/g, "")
    .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(seo.title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/, () => `<meta name="description" content="${esc(seo.description)}" />`)
    .replace("</head>", () => `  ${headTags(seo)}\n  </head>`)
    .replace(/<div id="root">\s*<\/div>/, () => `<div id="root">${seo.body}</div>`);
}

// The whole edge function for "/", "/annonces" and "/annonce/*".
// Returns undefined when it has nothing to do (Netlify then serves the page as usual).
export async function renderSeoPage({ request, next, supabaseUrl, anonKey, fetchImpl = fetch, timeoutMs = PAGE_TIMEOUT_MS }) {
  if (request.method !== "GET" || !supabaseUrl || !anonKey) return undefined;
  const url = new URL(request.url);
  const route = seoRoute(url.pathname);
  if (!route) return undefined;

  // Ask Supabase and get the page at the same time.
  const rowsPromise = fetchListings(queryFor(route), { supabaseUrl, anonKey, fetchImpl, timeoutMs }).catch(() => null);
  const pagePromise = next();
  pagePromise.catch(() => {}); // not awaited when we redirect

  const rows = await rowsPromise;
  if (rows === null) return pagePromise; // Supabase slow or down: the plain page

  let seo;
  try {
    seo = buildSeo(route, rows, url.pathname);
  } catch {
    return pagePromise;
  }
  if (seo.redirect) {
    // Old or shortened address of a listing (for example /annonce/12): send to its real address.
    return new Response(null, { status: 301, headers: { location: seo.redirect + url.search, "cache-control": "no-store" } });
  }

  const response = await pagePromise;
  if (response.status !== 200 || !(response.headers.get("content-type") || "").includes("text/html")) return response;
  const html = await response.text();
  let out;
  try {
    out = injectSeo(html, seo);
  } catch {
    return new Response(html, { status: response.status, headers: response.headers });
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("etag");
  headers.set("content-type", "text/html; charset=utf-8");
  return new Response(out, { status: seo.status, headers });
}

// ---------- sitemap.xml ----------
const day = iso => {
  const d = String(iso || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
};

export function renderSitemap(rows) {
  const newest = rows.map(r => day(r.created_at)).filter(Boolean).sort().pop() || null;
  const urls = [
    { loc: `${SITE_URL}/`, lastmod: newest },
    { loc: SITE_URL + PAGE_PATHS.listings, lastmod: newest },
    ...rows.map(r => ({ loc: SITE_URL + listingPath(r), lastmod: day(r.created_at) })),
  ];
  const body = urls
    .map(u => `  <url>\n    <loc>${esc(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""}\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// Every available listing. If Supabase can't be reached, the sitemap still lists the home and listings pages.
export async function renderSitemapResponse({ supabaseUrl, anonKey, fetchImpl = fetch, timeoutMs = SITEMAP_TIMEOUT_MS }) {
  let rows = [];
  if (supabaseUrl && anonKey) {
    try {
      rows = await fetchListings("select=id,titre,ville,created_at&disponible=eq.true&order=created_at.desc&limit=5000", { supabaseUrl, anonKey, fetchImpl, timeoutMs });
    } catch {
      rows = [];
    }
  }
  return new Response(renderSitemap(rows), {
    status: 200,
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=600" },
  });
}
