// Supabase JS with PKCE (S7.2); tokens handled by the SDK, never hand-rolled storage.
// Ships only the designed-public anon key (S7.3).
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { flowType: "pkce" } },
);
