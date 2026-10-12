// Helpers shared by the automatic tests: find Docker, run the Supabase CLI, read the LOCAL
// Supabase address and keys, and refuse anything that is not on this computer.
//
// Safety rule: the tests may only ever talk to a Supabase running on localhost / 127.0.0.1.
// The production keys in `.env` are never read here.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PRODUCTION_PROJECT_REF = "nnkrofhjhjyyprqhwbjv";
export const APP_PORT = 4399; // the test copy of the site (not 5173/4173, so it never mixes with `npm run dev`/`preview`)
export const APP_URL = `http://127.0.0.1:${APP_PORT}`;

const SUPABASE_CLI = path.join(ROOT, "node_modules", "supabase", "dist", "supabase.js");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

// Throws unless `url` is an http URL on this computer.
export function assertLocalUrl(url, what = "Supabase URL") {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`REFUSED: ${what} is missing or invalid (${JSON.stringify(url)}). Tests only run against a LOCAL Supabase.`);
  }
  if (parsed.protocol !== "http:" || !LOCAL_HOSTS.has(parsed.hostname) || url.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error(`REFUSED: ${what} must be http://127.0.0.1 or http://localhost, got ${parsed.origin}. The tests never touch production.`);
  }
  return url;
}

// process.env plus Docker Desktop's folder on PATH (on Windows it is often missing from PATH,
// and then `docker-credential-desktop` is not found).
export function dockerEnv(base = process.env) {
  const env = { ...base };
  const pathKey = Object.keys(env).find(k => k.toLowerCase() === "path") || "PATH";
  const current = env[pathKey] || "";
  const candidates = process.platform === "win32"
    ? [
        path.join(env.LOCALAPPDATA || "", "Programs", "DockerDesktop", "resources", "bin"),
        path.join(env.ProgramFiles || "C:\\Program Files", "Docker", "Docker", "resources", "bin"),
      ]
    : ["/usr/local/bin", "/Applications/Docker.app/Contents/Resources/bin"];
  const extra = candidates.filter(dir => dir && fs.existsSync(dir) && !current.toLowerCase().includes(dir.toLowerCase()));
  if (extra.length) env[pathKey] = [...extra, current].join(path.delimiter);
  return env;
}

// Runs the pinned Supabase CLI (devDependency). Returns { status, stdout, stderr }.
export function supabaseCli(args, { inherit = false } = {}) {
  if (!fs.existsSync(SUPABASE_CLI)) throw new Error("Supabase CLI not found. Run `npm install` first.");
  const res = spawnSync(process.execPath, [SUPABASE_CLI, ...args], {
    cwd: ROOT,
    env: dockerEnv(),
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) throw res.error;
  return { status: res.status, stdout: res.stdout || "", stderr: res.stderr || "" };
}

// Runs the Supabase CLI and shows its progress live, but hides lines with keys (the CLI prints
// the local keys when it starts; they are only local demo keys, but they don't belong in logs).
export function supabaseCliLive(args) {
  if (!fs.existsSync(SUPABASE_CLI)) throw new Error("Supabase CLI not found. Run `npm install` first.");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SUPABASE_CLI, ...args], { cwd: ROOT, env: dockerEnv(), stdio: ["ignore", "pipe", "pipe"] });
    const hidden = /KEY|SECRET|eyJ|sb_secret_|sb_publishable_|DB_URL|postgresql:\/\//i;
    const show = stream => {
      let rest = "";
      stream.setEncoding("utf8");
      stream.on("data", chunk => {
        const lines = (rest + chunk).split(/\r?\n/);
        rest = lines.pop();
        for (const line of lines) if (line.trim() && !hidden.test(line)) console.log(`  ${line}`);
      });
    };
    show(child.stdout);
    show(child.stderr);
    child.on("error", reject);
    child.on("close", status => resolve({ status }));
  });
}

// Address and keys of the running LOCAL Supabase, or null if it is not running.
export function readLocalStatus() {
  const res = supabaseCli(["status", "--output", "json"]);
  if (res.status !== 0) return null;
  const start = res.stdout.indexOf("{");
  if (start === -1) return null;
  let data;
  try {
    data = JSON.parse(res.stdout.slice(start));
  } catch {
    return null;
  }
  const url = data.API_URL;
  const anonKey = data.ANON_KEY || data.PUBLISHABLE_KEY;
  const serviceRoleKey = data.SERVICE_ROLE_KEY || data.SECRET_KEY;
  if (!url || !anonKey || !serviceRoleKey) return null;
  assertLocalUrl(url);
  return { url, anonKey, serviceRoleKey };
}

let cached = null;

// Local Supabase settings for the tests: from E2E_SUPABASE_* (set by `npm run test:e2e`),
// otherwise asked from the Supabase CLI. Always checked to be local.
export function localSupabaseEnv() {
  if (cached) return cached;
  let env;
  if (process.env.E2E_SUPABASE_URL && process.env.E2E_SUPABASE_ANON_KEY && process.env.E2E_SUPABASE_SERVICE_ROLE_KEY) {
    env = {
      url: process.env.E2E_SUPABASE_URL,
      anonKey: process.env.E2E_SUPABASE_ANON_KEY,
      serviceRoleKey: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY,
    };
  } else {
    env = readLocalStatus();
    if (!env) {
      throw new Error("Local Supabase is not running. Use `npm run test:e2e` (it starts it), or `npx supabase start` first.");
    }
    process.env.E2E_SUPABASE_URL = env.url;
    process.env.E2E_SUPABASE_ANON_KEY = env.anonKey;
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = env.serviceRoleKey;
  }
  assertLocalUrl(env.url);
  cached = env;
  return env;
}

// The production Supabase URL from `.env` (only to make sure it never ends up in the test build).
export function productionUrlFromDotEnv() {
  try {
    const text = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
    const m = text.match(/^\s*VITE_SUPABASE_URL\s*=\s*["']?([^"'\s]+)/m);
    return m ? m[1].replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}
