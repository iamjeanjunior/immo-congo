// One-time tool: moves the old base64 photos of existing listings to Supabase Storage.
// It shrinks each photo with the same code as the website (src/photos.js), then sends it
// to the temporary Edge Function "migrate-listing-photos", which saves and checks it.
// It does NOT change any listing. See supabase/one-off/20261012_photo_migration.sql.
//
// How to run (needs `npm run dev` and a browser on http://localhost:5173):
//   const m = await import("/scripts/migrate-photos.js");
//   await m.uploadAll({ token: "<one-time token>", run: "dryrun" });  // test copies
//   await m.cleanup({ token: "<one-time token>" });                    // remove test copies
//   await m.uploadAll({ token: "<one-time token>", run: "apply" });    // real copies
import { createClient } from "@supabase/supabase-js";
import { listingPhotos, compressPhoto } from "../src/photos.js";

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const FUNCTION_NAME = "migrate-listing-photos";

async function sha12(text) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function callFunction(token, body) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body, headers: { "x-migration-token": token } });
  if (!error) return data;
  let detail = error.message;
  try { detail = (await error.context.json()).error || detail; } catch { /* keep message */ }
  return { ok: false, error: detail };
}

// Uploads a shrunk copy of every base64 photo. run: "dryrun" (test folder) or "apply".
export async function uploadAll({ token, run = "dryrun" }) {
  const { data: listings, error } = await supabase.from("listings").select("id, owner_id, images, image_url").order("id");
  if (error) throw error;
  const report = [];
  for (const listing of listings) {
    const photos = [...new Set(listingPhotos(listing).filter(p => p.startsWith("data:")))];
    for (const dataUrl of photos) {
      const sha = await sha12(dataUrl);
      const original = await (await fetch(dataUrl)).blob();
      const file = new File([original], `listing-${listing.id}-${sha}.jpg`, { type: original.type || "image/jpeg" });
      const small = await compressPhoto(file);
      const result = await callFunction(token, {
        action: "upload", run, listingId: listing.id, sha, contentType: small.type, data: await blobToBase64(small),
      });
      report.push({
        listing: listing.id, sha, beforeKB: Math.round(original.size / 1024), afterKB: Math.round(small.size / 1024),
        type: small.type, ok: !!result?.ok, path: result?.path, error: result?.error,
      });
    }
  }
  return report;
}

// Removes every dry-run copy.
export function cleanup({ token }) {
  return callFunction(token, { action: "cleanup" });
}
