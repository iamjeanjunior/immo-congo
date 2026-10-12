// Automatic browser tests. Run them with `npm run test:e2e` (see CLAUDE.md).
// They only run against the LOCAL Supabase (Docker) and a local test build of the site.
import { defineConfig } from "@playwright/test";
import { APP_URL, localSupabaseEnv } from "./scripts/e2e/local-supabase.mjs";

// Refuses to load unless Supabase is on localhost / 127.0.0.1 (throws otherwise).
localSupabaseEnv();

const phone = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const desktop = { viewport: { width: 1280, height: 800 } };

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // 2 browsers at a time: Junior's laptop is often short of memory (Docker + other apps), and
  // Chrome then fails with net::ERR_INSUFFICIENT_RESOURCES. Override with E2E_WORKERS=4 if there is room.
  workers: Number(process.env.E2E_WORKERS) || 2,
  retries: 0, // a failure is a real signal, not something to hide by retrying
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: true,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/e2e-summary.json" }],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: APP_URL,
    locale: "fr-FR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  projects: [
    // No browser: database rules checked straight through supabase-js, and the Edge Function (link previews, sitemap) with fake data.
    { name: "api", testMatch: /(security|seo-edge)\.spec\.js/ },
    // Every browser test at phone size (375px)...
    { name: "phone", testIgnore: /(security|seo-edge)\.spec\.js/, use: phone },
    // ...and the ones where the desktop layout matters (tagged @desktop) at computer size.
    { name: "desktop", testIgnore: /(security|seo-edge)\.spec\.js/, grep: /@desktop/, use: desktop },
  ],
  webServer: {
    command: "node scripts/e2e/serve.mjs",
    url: APP_URL,
    reuseExistingServer: false, // never reuse an unknown server: it could be pointing at production
    timeout: 120_000,
    stdout: "pipe",
  },
});
