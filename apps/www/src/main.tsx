// Boot entry: mounts the marketing page, owns the stylesheet side-effect import
// (keeping App SSR-safe for the copy-parity suite), and loads analytics when a
// Plausible script URL is configured.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initAnalytics } from "./lib/analytics";
import "./styles.css";

initAnalytics(import.meta.env.VITE_PLAUSIBLE_SRC);

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing #root");
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
