// app/ is wiring only (§1b): providers + router + auth guard.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthGuard } from "./app/auth";
import { Router } from "./app/router";
import "./index.css";

const queryClient = new QueryClient();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing #root");

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGuard>
        <Router />
      </AuthGuard>
    </QueryClientProvider>
  </StrictMode>,
);
