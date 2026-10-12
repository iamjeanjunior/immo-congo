// Listing photos: reading old/new formats, checking and shrinking photos on the device.

export const PHOTO_BUCKET = "listing-photos";
export const MAX_PHOTOS = 6;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;   // refuse originals bigger than 20 MB
const MAX_OUTPUT_BYTES = 1024 * 1024;       // same as the Storage bucket limit
const TARGET_BYTES = 300 * 1024;            // aim for under ~300 KB per photo
// [longest side in px, quality] — tried in order until the photo is small enough.
const ATTEMPTS = [[1600, 0.8], [1600, 0.7], [1280, 0.7], [1280, 0.6]];
const INPUT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const INPUT_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif"];

// All photos of a listing, old (base64 data URL) or new (Storage URL).
// Old rows may only have image_url, with images empty or missing.
export function listingPhotos(listing) {
  if (!listing) return [];
  let photos = [];
  try {
    const parsed = JSON.parse(listing.images || "[]");
    if (Array.isArray(parsed)) photos = parsed.filter(p => typeof p === "string" && p);
  } catch {
    // broken JSON: fall back to image_url below
  }
  if (!photos.length && listing.image_url) photos = [listing.image_url];
  return photos;
}

// Storage path ("<user id>/<file>") if src is a public URL from our bucket, else null.
export function storagePathFromUrl(src) {
  if (typeof src !== "string") return null;
  const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`;
  const i = src.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(src.slice(i + marker.length).split("?")[0]);
}

// French error message if the file is not an accepted photo, else null.
export function checkPhotoFile(file) {
  const type = (file.type || "").toLowerCase();
  const ext = (file.name || "").split(".").pop().toLowerCase();
  // Some Android file pickers give no type: then trust the file extension.
  const typeKnown = type && type !== "application/octet-stream";
  const typeOk = typeKnown ? INPUT_TYPES.includes(type) : INPUT_EXTENSIONS.includes(ext);
  if (!typeOk) return `« ${file.name} » : format non accepté. Choisissez une photo (JPG, PNG ou WebP).`;
  if (file.size > MAX_INPUT_BYTES) return `« ${file.name} » est trop lourde (max 20 Mo).`;
  return null;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode"));
    img.src = src;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

// Draws the photo at most maxSide px wide/high and encodes it (WebP, or JPEG if
// the browser can't make WebP, e.g. Safari). Phone rotation (EXIF) is applied by the browser.
async function renderPhoto(img, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // transparent PNG areas become white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let blob = await canvasToBlob(canvas, "image/webp", quality);
  if (!blob || blob.type !== "image/webp") blob = await canvasToBlob(canvas, "image/jpeg", quality);
  canvas.width = 0; // frees memory quickly on iPhones
  canvas.height = 0;
  return blob;
}

// Shrinks a photo file on the device. Returns a WebP/JPEG Blob, ideally under ~300 KB.
// Throws an Error with a French message if the file can't be read as a photo.
export async function compressPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    let img;
    try {
      img = await loadImage(url);
    } catch {
      throw new Error(`Impossible de lire « ${file.name} ». Essayez une photo JPG ou PNG.`);
    }
    if (!img.naturalWidth || !img.naturalHeight) throw new Error(`« ${file.name} » n'est pas une photo valide.`);
    let best = null;
    for (const [side, quality] of ATTEMPTS) {
      const blob = await renderPhoto(img, side, quality);
      if (blob && (!best || blob.size < best.size)) best = blob;
      if (best && best.size <= TARGET_BYTES) break;
    }
    if (!best) throw new Error(`Impossible de préparer « ${file.name} ».`);
    if (best.size > MAX_OUTPUT_BYTES) throw new Error(`« ${file.name} » reste trop lourde après réduction.`);
    return best;
  } finally {
    URL.revokeObjectURL(url);
  }
}
