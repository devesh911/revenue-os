// The console's entry: mounts what app/Boot.tsx decides to show (the app, or the configuration screen when its
// settings are missing). index.css is imported here so its styles cover the configuration screen too. It runs only
// in a browser (it needs the page's #root), so the browser checks are what run it.
import { createRoot } from "react-dom/client";
import { Boot } from "./app/Boot"; // coverage: browser-only (apps/console/e2e/no-settings.e2e.ts)
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing #root");
// coverage: browser-only (apps/console/e2e/no-settings.e2e.ts)
createRoot(rootEl).render(<Boot env={import.meta.env} />);
