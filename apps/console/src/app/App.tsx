// The mounted app tree (§1b wiring: providers + auth guard + router). Split out of main.tsx so
// it can be dynamically imported ONLY after env validation passes. Importing it eagerly would
// pull lib/supabase's module-scope createClient(import.meta.env…), which throws
// "supabaseUrl is required." when env is absent — the white-screen defect task-16 fixes.
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
