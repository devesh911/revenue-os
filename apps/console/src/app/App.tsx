// The mounted app tree (providers + session + router). Kept out of main.tsx so the
// boot entry stays a thin env-gate. lib/supabase constructs its client lazily (getSupabase), so
// importing this tree — even statically, before env is validated — builds no client and cannot
// throw "supabaseUrl is required." at module scope (the lazy Supabase client, #53; supersedes the
// dynamic-import workaround from the boot-honesty fix, #49). main.tsx renders <App /> only when
// parseConsoleEnv is ok.
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createQueryClient } from "../lib/query";
import { getSupabase } from "../lib/supabase";
import { Router } from "./router";
import { SessionProvider } from "./session/SessionProvider";

// Built once. A 401 means the session is gone server-side: sign this device out, and the session
// gate sends the visitor to /login with `next` (it was not a deliberate sign-out).
const queryClient = createQueryClient({
  onUnauthorized: () => void getSupabase().auth.signOut({ scope: "local" }),
});

export function App() {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <SessionProvider queryClient={queryClient}>
          <Router />
        </SessionProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}
