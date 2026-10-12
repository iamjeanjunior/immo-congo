// DISABLED. The one-time photo migration finished on 2026-10-12.
// The original code is in git history (commit 44993bf). Delete this function in the
// Supabase dashboard (Edge Functions > migrate-listing-photos > Delete) when convenient.
Deno.serve(() => new Response(JSON.stringify({ error: "gone: photo migration finished" }), {
  status: 410,
  headers: { "Content-Type": "application/json" },
}));
