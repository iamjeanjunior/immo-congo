// ImmoCongo — Edge Function "update-exchange-rate".
// Once a day (pg_cron, see supabase/one-off/20261012_exchange_rate_schedule.sql) it downloads the
// USD rates from ExchangeRate-API's free open endpoint and stores USD→CDF, EUR, ZAR and ZMW in
// public.exchange_rates. Visitors' browsers only read our table, never the third-party site.
//
// - The site shows the required attribution "Rates By Exchange Rate API" (footer).
// - If the download fails or a rate looks wrong, nothing is written: the last good rate stays.
// - Deployed with verify_jwt = false so the daily database job can call it without a key. It takes no
//   input and only refreshes a public rate; it does nothing if the stored rate is less than 20 hours
//   old, so calling it more often cannot hammer the source or change anything.
import { createClient } from "npm:@supabase/supabase-js@2";

const SOURCE = "https://open.er-api.com/v6/latest/USD";
// Plausible range for each stored rate (1 USD = ...). Anything outside is refused.
const QUOTES: Record<string, [number, number]> = { CDF: [500, 20000], EUR: [0.3, 3], ZAR: [5, 60], ZMW: [5, 200] };
const MIN_HOURS_BETWEEN_UPDATES = 20;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async () => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: last, error: readError } = await db
    .from("exchange_rates")
    .select("updated_at")
    .eq("base", "USD")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) return json({ status: "error", error: readError.message }, 500);
  if (last && Date.now() - new Date(last.updated_at).getTime() < MIN_HOURS_BETWEEN_UPDATES * 3600_000) {
    return json({ status: "fresh", updated_at: last.updated_at });
  }

  let body;
  try {
    const res = await fetch(SOURCE, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    body = await res.json();
  } catch (err) {
    return json({ status: "error", error: `download failed: ${err}` }, 502);
  }
  if (body?.result !== "success" || typeof body.rates !== "object") {
    return json({ status: "error", error: "unexpected answer from the source" }, 502);
  }

  const now = new Date().toISOString();
  const published = Number(body.time_last_update_unix) ? new Date(body.time_last_update_unix * 1000).toISOString() : null;
  const rows = [];
  for (const [quote, [min, max]] of Object.entries(QUOTES)) {
    const rate = Number(body.rates[quote]);
    if (!Number.isFinite(rate) || rate < min || rate > max) {
      return json({ status: "error", error: `implausible ${quote} rate: ${body.rates[quote]}` }, 502);
    }
    rows.push({ base: "USD", quote, rate, source: "open.er-api.com (ExchangeRate-API)", source_updated_at: published, updated_at: now });
  }

  const { error } = await db.from("exchange_rates").upsert(rows, { onConflict: "base,quote" });
  if (error) return json({ status: "error", error: error.message }, 500);
  return json({ status: "updated", source_updated_at: published, rates: Object.fromEntries(rows.map(r => [r.quote, r.rate])) });
});
