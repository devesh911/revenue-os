// Boot entry (§1b wiring). Env is validated BEFORE we render: on missing/empty/invalid vars we
// render the ConfigErrorScreen instead of white-screening; only on ok do we render <App />.
// lib/supabase now builds its client lazily (getSupabase), so App is safe to import STATICALLY
// even when env is absent (task-21) — no dynamic app-chunk import and no boot chunk to fail.
// index.css stays a static import so styles cover the error screen too.
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { ConfigErrorScreen } from "./app/ConfigErrorScreen";
import { parseConsoleEnv } from "./lib/env";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing #root");
const root = createRoot(rootEl);

const parsed = parseConsoleEnv(import.meta.env);
root.render(
  parsed.ok ? <App /> : <ConfigErrorScreen missing={parsed.missing} />,
);
