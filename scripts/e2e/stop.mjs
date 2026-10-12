// `npm run supabase:stop` — stops the local Supabase (frees the memory Docker uses).
// Uses the same Docker PATH fix as the tests. The test data is thrown away; the next
// `npm run test:e2e` starts it again and reloads the migrations and the seed.
import { supabaseCliLive } from "./local-supabase.mjs";

const { status } = await supabaseCliLive(["stop"]);
process.exit(status ?? 1);
