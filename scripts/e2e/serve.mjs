// Builds the site against the LOCAL Supabase and serves it on http://127.0.0.1:4399 for the tests.
// Started by Playwright (see playwright.config.js). Production `.env` is never used:
// Vite reads env files from an empty folder, and only the two local values below reach the app.
import fs from "node:fs";
import path from "node:path";
import { build, preview } from "vite";
import { ROOT, APP_PORT, PRODUCTION_PROJECT_REF, assertLocalUrl, localSupabaseEnv, productionUrlFromDotEnv } from "./local-supabase.mjs";

const env = localSupabaseEnv();
assertLocalUrl(env.url);

const work = path.join(ROOT, "node_modules", ".e2e");
const outDir = path.join(work, "dist");
const envDir = path.join(work, "no-env-files"); // empty on purpose: no .env file is read
fs.rmSync(envDir, { recursive: true, force: true });
fs.mkdirSync(envDir, { recursive: true });

for (const key of Object.keys(process.env)) {
  if (key.startsWith("VITE_")) delete process.env[key];
}
process.env.VITE_SUPABASE_URL = env.url;
process.env.VITE_SUPABASE_ANON_KEY = env.anonKey;

const common = { root: ROOT, mode: "e2e", envDir, logLevel: "warn", clearScreen: false };
await build({ ...common, build: { outDir, emptyOutDir: true } });

// Safety check: the built site must talk to the local Supabase, never to production.
const assetsDir = path.join(outDir, "assets");
const bundle = fs.readdirSync(assetsDir)
  .filter(f => f.endsWith(".js"))
  .map(f => fs.readFileSync(path.join(assetsDir, f), "utf8"))
  .join("\n");
const prodUrl = productionUrlFromDotEnv();
if (bundle.includes(PRODUCTION_PROJECT_REF) || (prodUrl && bundle.includes(prodUrl)) || !bundle.includes(env.url)) {
  console.error("REFUSED: the test build does not point only at the local Supabase. Stopping.");
  process.exit(1);
}

const server = await preview({
  ...common,
  build: { outDir },
  preview: { host: "127.0.0.1", port: APP_PORT, strictPort: true, open: false },
});
console.log(`Test site ready on http://127.0.0.1:${APP_PORT} (local Supabase ${env.url})`);

function stop() {
  server.httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
