// `npm run db:fingerprint` — prints the schema fingerprint of the LOCAL database
// (see schema-fingerprint.sql), to compare with the same query run on production.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, dockerEnv } from "./local-supabase.mjs";

const sql = fs.readFileSync(path.join(ROOT, "scripts", "e2e", "schema-fingerprint.sql"), "utf8");
const res = spawnSync("docker", ["exec", "-i", "supabase_db_immo-congo", "psql", "-U", "postgres", "-d", "postgres", "-At", "-F", " "], {
  input: sql,
  env: dockerEnv(),
  encoding: "utf8",
});
if (res.error || res.status !== 0) {
  console.error(res.stderr || res.error?.message || "failed");
  console.error("Is the local Supabase running? (npm run test:e2e starts it)");
  process.exit(1);
}
process.stdout.write(res.stdout);
