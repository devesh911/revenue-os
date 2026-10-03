// The console's entry: mounts what app/Boot.tsx decides to show (the app, or the configuration screen when its
// settings are missing). index.css is imported here so its styles cover the configuration screen too.
import { createRoot } from "react-dom/client";
import { Boot } from "./app/Boot";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing #root");
createRoot(rootEl).render(<Boot env={import.meta.env} />);
