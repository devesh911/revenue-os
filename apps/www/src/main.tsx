// Boot entry: mounts the marketing page, owns the stylesheet side-effect import
// (keeping App SSR-safe for the copy-parity suite), and loads analytics when a
// Plausible script URL is configured. armChime() lets the first tap, click or key
// press unlock sound for the message chime (browsers block audio before that).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initAnalytics } from "./lib/analytics";
import { armChime } from "./lib/chime";
import "./styles.css";

initAnalytics(import.meta.env.VITE_PLAUSIBLE_SRC);
armChime();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing #root");
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
