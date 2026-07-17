// Supabase JS with PKCE (S7.2); tokens handled by the SDK, never hand-rolled storage.
// Ships only the designed-public anon key (S7.3). The client is constructed lazily on the first
// getSupabase() call and memoized — importing this module builds NOTHING, so it is safe on
// main.tsx's static import graph even when env is absent (task-21). This deletes the old
// module-scope `createClient(import.meta.env…)` that threw "supabaseUrl is required." at import.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  _client ??= createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    { auth: { flowType: "pkce" } },
  );
  return _client;
}
