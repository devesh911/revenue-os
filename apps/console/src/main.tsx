// Boot entry (§1b wiring). Env is validated BEFORE the app tree loads: on missing/empty/invalid
// vars we render the ConfigErrorScreen instead of white-screening, and only on ok do we
// dynamically import ./app/App — whose transitive lib/supabase createClient would otherwise throw
// at module scope before React mounts (task-16). A chunk-load failure of that dynamic import
// (stale hash after a redeploy, network blip) falls back to BootErrorScreen — #root is never left
// blank. index.css stays a static import so styles cover the error screens too.
import { createRoot } from "react-dom/client";
import { BootErrorScreen } from "./app/BootErrorScreen";
import { ConfigErrorScreen } from "./app/ConfigErrorScreen";
import { parseConsoleEnv } from "./lib/env";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing #root");
const root = createRoot(rootEl);

const parsed = parseConsoleEnv(import.meta.env);
if (!parsed.ok) {
  root.render(<ConfigErrorScreen missing={parsed.missing} />);
} else {
  import("./app/App")
    .then(({ App }) => root.render(<App />))
    .catch(() => root.render(<BootErrorScreen />));
}
