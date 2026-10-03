// Supabase JS with PKCE (docs/security.md S7.2); tokens handled by the SDK, never hand-rolled storage.
// Ships only the designed-public anon key (docs/security.md S7.3). The client is constructed lazily on the first
// getSupabase() call and memoized, so importing this module builds nothing and the console's code
// loads even when its settings are missing (app/Boot.tsx then shows the configuration screen;
// apps/console/test/boot.test.tsx proves it). This is the one file that imports the Supabase
// package (apps/console/biome.json): other files take its types from here.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type { SupabaseClient };

let _client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  _client ??= createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    { auth: { flowType: "pkce" } },
  );
  return _client;
}
