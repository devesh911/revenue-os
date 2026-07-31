// Boot entry: mounts the marketing page and owns the stylesheet side-effect import,
// keeping App SSR-safe (the copy-parity suite imports App without a CSS loader) —
// the same App / main split the console uses.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing #root");
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
