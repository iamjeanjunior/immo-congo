// `npm run test:e2e` — the one command for the automatic tests.
//   1. checks Docker Desktop is running
//   2. starts the LOCAL Supabase if needed (first time: downloads it, can take several minutes)
//   3. resets it: every migration in supabase/migrations/ + supabase/seed.sql (test accounts and listings)
//   4. builds the site against it and runs the Playwright tests (phone 375px + desktop)
//   5. prints a short summary
// It refuses to run unless Supabase is on localhost/127.0.0.1: the tests never touch production.
//
// Options:  --no-reset   keep the current local data (faster when re-running one test)
// Anything else is passed to Playwright, e.g.  npm run test:e2e -- -g "favoris"  or  -- --project=phone
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, assertLocalUrl, dockerEnv, readLocalStatus, supabaseCli, supabaseCliLive } from "./local-supabase.mjs";

// Services the site doesn't use (also switched off in supabase/config.toml).
const EXCLUDED = "postgres-meta,imgproxy,mailpit,studio,edge-runtime,logflare,vector,supavisor";
const SUMMARY_FILE = path.join(ROOT, "test-results", "e2e-summary.json");
const ANSI_COLORS = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

const args = process.argv.slice(2);
const noReset = args.includes("--no-reset");
const playwrightArgs = args.filter(a => a !== "--no-reset");
const started = Date.now();

function say(msg) { console.log(`\n=== ${msg}`); }
function fail(msg) { console.error(`\nSTOPPED: ${msg}\n`); process.exit(1); }
function seconds(ms) {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
}

// 1. Docker
say("1/4 Docker Desktop");
const docker = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { env: dockerEnv(), encoding: "utf8" });
if (docker.error || docker.status !== 0) fail("Docker Desktop is not running (or not installed). Open Docker Desktop, wait until it says it is running, then try again.");
console.log(`Docker ${docker.stdout.trim()} is running.`);

// 2. Local Supabase
say("2/4 Local Supabase");
let status = readLocalStatus();
if (!status) {
  console.log("Starting the local Supabase (the very first time it downloads it: this can take several minutes)...");
  const res = await supabaseCliLive(["start", "-x", EXCLUDED]);
  if (res.status !== 0) fail("the local Supabase did not start. Run `npx supabase start` to see why (Docker memory? another project using the same ports?).");
  status = readLocalStatus();
  if (!status) fail("the local Supabase started but its address and keys could not be read (`npx supabase status`).");
} else {
  console.log("Already running.");
}
try {
  assertLocalUrl(status.url);
} catch (err) {
  fail(err.message);
}
console.log(`Local Supabase: ${status.url}`);

// 3. Fresh database: migrations + seed
if (noReset) {
  say("3/4 Reset skipped (--no-reset)");
} else {
  say("3/4 Resetting the local database (migrations + seed)");
  const res = supabaseCli(["db", "reset", "--local"]);
  if (res.status !== 0) {
    console.error(res.stdout.slice(-4000));
    console.error(res.stderr.slice(-4000));
    fail("`supabase db reset` failed: a migration or supabase/seed.sql has an error (see above).");
  }
  console.log("Database reset done.");
  status = readLocalStatus() || status; // keys don't change, but re-read in case containers were restarted
}

// 4. Tests
say("4/4 Browser tests (Playwright, Chromium)");
fs.rmSync(SUMMARY_FILE, { force: true });
const testEnv = { ...process.env };
for (const key of Object.keys(testEnv)) {
  if (key.startsWith("VITE_")) delete testEnv[key]; // never pass production settings along
}
Object.assign(testEnv, {
  E2E_SUPABASE_URL: status.url,
  E2E_SUPABASE_ANON_KEY: status.anonKey,
  E2E_SUPABASE_SERVICE_ROLE_KEY: status.serviceRoleKey,
});
const pwCli = path.join(ROOT, "node_modules", "@playwright", "test", "cli.js");
const pw = spawnSync(process.execPath, [pwCli, "test", ...playwrightArgs], { cwd: ROOT, env: testEnv, stdio: "inherit" });

printSummary(pw.status);
process.exit(pw.status ?? 1);

function printSummary(exitCode) {
  let report = null;
  try {
    report = JSON.parse(fs.readFileSync(SUMMARY_FILE, "utf8"));
  } catch {
    // no report: Playwright could not start (config error, port in use...)
  }
  const line = "=".repeat(64);
  console.log(`\n${line}`);
  if (!report) {
    console.log(" ImmoCongo automatic tests: COULD NOT RUN (see the messages above)");
    console.log(line);
    return;
  }
  const tests = [];
  (function walk(suites, file) {
    for (const s of suites || []) {
      const f = s.file || file;
      for (const spec of s.specs || []) {
        for (const t of spec.tests || []) tests.push({ file: f, title: spec.title, project: t.projectName, t });
      }
      walk(s.suites, f);
    }
  })(report.suites);

  const passed = tests.filter(x => x.t.status === "expected" && x.t.expectedStatus === "passed");
  const knownBugs = tests.filter(x => x.t.status === "expected" && x.t.expectedStatus === "failed");
  const failed = tests.filter(x => x.t.status === "unexpected");
  const flaky = tests.filter(x => x.t.status === "flaky");
  const skipped = tests.filter(x => x.t.status === "skipped");
  const ok = exitCode === 0 && failed.length === 0;

  console.log(` ImmoCongo automatic tests: ${ok ? "ALL PASSED" : "FAILED"}`);
  console.log(` ${passed.length} passed, ${failed.length} failed, ${knownBugs.length} known bug(s) (expected to fail), ${flaky.length} flaky, ${skipped.length} skipped`);
  console.log(` Total time: ${seconds(Date.now() - started)} (tests: ${seconds(report.stats?.duration || 0)})`);
  if (knownBugs.length) {
    console.log("\n Known bugs (marked expected-to-fail, still to fix):");
    for (const x of knownBugs) {
      const note = (x.t.annotations || []).find(a => a.type === "fail")?.description;
      console.log(`  - [${x.project}] ${x.file} > ${x.title}${note ? `\n      ${note}` : ""}`);
    }
  }
  if (failed.length) {
    console.log("\n Failed:");
    for (const x of failed) {
      const err = (x.t.results || []).map(r => r.error?.message).find(Boolean) || "";
      const first = err.replace(ANSI_COLORS, "").split("\n").find(l => l.trim()) || "";
      console.log(`  - [${x.project}] ${x.file} > ${x.title}\n      ${first.trim().slice(0, 200)}`);
    }
    console.log("\n Details, screenshots and traces: npx playwright show-report");
  }
  console.log(line);
}
