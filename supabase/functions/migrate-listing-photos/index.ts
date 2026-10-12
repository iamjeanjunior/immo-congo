// TEMPORARY one-time Edge Function: stores shrunk copies of the old base64 listing
// photos in Storage. Delete this function once the photo migration is finished.
//
// - Called by scripts/migrate-photos.js (which shrinks each photo in the browser, with the
//   same code as the website) with a one-time token in the "x-migration-token" header.
// - Uses the service role key that Supabase gives every Edge Function, so that key
//   never leaves Supabase.
// - It NEVER changes the listings table. It only accepts a photo that matches a base64
//   photo of the given listing (by SHA-256), saves it at a fixed path, downloads it back
//   and checks the bytes. Switching the listings to the new URLs is a separate SQL step
//   (supabase/one-off/20261012_photo_migration.sql).
//
// Paths:  listing-photos/<owner id>/migrated/<listing id>-<sha12>.<webp|jpg>          (run: "apply")
//         listing-photos/<owner id>/dryrun-migration/<listing id>-<sha12>.<webp|jpg>  (run: "dryrun")
// <sha12> = first 12 hex chars of SHA-256 of the full original data URL string.

import { createClient } from "npm:@supabase/supabase-js@2";

// SHA-256 of the one-time token. To run again later: make a new random token,
// put its SHA-256 here and redeploy.
const TOKEN_SHA256 = "0fac41ae2019b1f4a4714281b62af3b7fa801a03ce7d0cdc91e3d917cc09691e";
const BUCKET = "listing-photos";
const MAX_BYTES = 1024 * 1024;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-migration-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Same rule as listingPhotos() in src/photos.js.
function listingPhotos(listing: { images: string | null; image_url: string | null }): string[] {
  let photos: string[] = [];
  try {
    const parsed = JSON.parse(listing.images || "[]");
    if (Array.isArray(parsed)) photos = parsed.filter(p => typeof p === "string" && p);
  } catch {
    // fall back to image_url
  }
  if (!photos.length && listing.image_url) photos = [listing.image_url];
  return photos;
}

function looksLike(bytes: Uint8Array, type: string): boolean {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/webp") {
    const ascii = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
    return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  }
  return false;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "POST only" });

  const token = req.headers.get("x-migration-token") || "";
  if (!token || (await sha256Hex(token)) !== TOKEN_SHA256) return reply(403, { error: "forbidden" });

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return reply(500, { error: "missing Supabase env" });
  const admin = createClient(url, key, { auth: { persistSession: false } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: "bad JSON" }); }

  // Remove every dry-run copy.
  if (body.action === "cleanup") {
    const { data: owners, error } = await admin.from("listings").select("owner_id");
    if (error) return reply(500, { error: error.message });
    let removed = 0;
    for (const owner of new Set((owners || []).map(o => o.owner_id).filter(Boolean))) {
      const folder = `${owner}/dryrun-migration`;
      const { data: files } = await admin.storage.from(BUCKET).list(folder, { limit: 1000 });
      const paths = (files || []).map(f => `${folder}/${f.name}`);
      if (paths.length) {
        const { data: gone, error: rmError } = await admin.storage.from(BUCKET).remove(paths);
        if (rmError) return reply(500, { error: rmError.message });
        removed += (gone || []).length;
      }
    }
    return reply(200, { ok: true, removed });
  }

  if (body.action !== "upload") return reply(400, { error: "unknown action" });
  const listingId = Number(body.listingId);
  const sha = String(body.sha || "");
  const contentType = String(body.contentType || "");
  const run = body.run === "apply" ? "apply" : body.run === "dryrun" ? "dryrun" : "";
  if (!Number.isInteger(listingId) || !/^[0-9a-f]{12}$/.test(sha) || !run) return reply(400, { error: "bad listingId / sha / run" });
  if (contentType !== "image/webp" && contentType !== "image/jpeg") return reply(400, { error: "only webp or jpeg" });

  // The photo must be one of this listing's old base64 photos.
  const { data: listing, error: readError } = await admin.from("listings").select("id, owner_id, images, image_url").eq("id", listingId).single();
  if (readError || !listing) return reply(404, { error: "listing not found" });
  if (!listing.owner_id) return reply(400, { error: "listing has no owner" });
  let original: string | undefined;
  for (const p of listingPhotos(listing).filter(p => p.startsWith("data:"))) {
    if ((await sha256Hex(p)).startsWith(sha)) { original = p; break; }
  }
  if (!original) return reply(400, { error: "no base64 photo of this listing matches sha" });

  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(String(body.data || "")), c => c.charCodeAt(0)); } catch { return reply(400, { error: "bad base64" }); }
  if (bytes.length < 1024 || bytes.length > MAX_BYTES) return reply(400, { error: `size ${bytes.length} out of range` });
  if (!looksLike(bytes, contentType)) return reply(400, { error: "bytes are not a " + contentType });

  const ext = contentType === "image/webp" ? "webp" : "jpg";
  const folder = run === "apply" ? "migrated" : "dryrun-migration";
  const path = `${listing.owner_id}/${folder}/${listingId}-${sha}.${ext}`;
  const { error: upError } = await admin.storage.from(BUCKET).upload(path, new Blob([bytes], { type: contentType }), {
    contentType,
    cacheControl: run === "apply" ? "31536000" : "60",
    upsert: true,
  });
  if (upError) return reply(500, { error: "upload failed: " + upError.message });

  // Verify: download through the public URL and compare the bytes.
  const publicUrl = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const check = await fetch(`${publicUrl}?verify=${crypto.randomUUID()}`);
  const back = new Uint8Array(await check.arrayBuffer());
  const verified = check.ok && back.length === bytes.length && (await sha256Hex(back)) === (await sha256Hex(bytes));
  if (!verified) return reply(500, { error: `verification failed (HTTP ${check.status}, ${back.length} bytes)`, path });

  const originalBytes = Math.floor((original.length - original.indexOf(",") - 1) * 3 / 4);
  return reply(200, { ok: true, run, path, url: publicUrl, bytes: bytes.length, originalBytes, contentType: check.headers.get("content-type") });
});
