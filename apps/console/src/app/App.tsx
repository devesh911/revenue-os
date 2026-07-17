// The mounted app tree (§1b wiring: providers + auth guard + router). Kept out of main.tsx so the
// boot entry stays a thin env-gate. lib/supabase constructs its client lazily (getSupabase), so
// importing this tree — even statically, before env is validated — builds no client and cannot
// throw "supabaseUrl is required." at module scope (task-21; supersedes the task-16 dynamic-import
// workaround). main.tsx renders <App /> only when parseConsoleEnv is ok.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { AuthGuard } from "./auth";
import { Router } from "./router";

const queryClient = new QueryClient();

export function App() {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthGuard>
          <Router />
        </AuthGuard>
      </QueryClientProvider>
    </StrictMode>
  );
}
