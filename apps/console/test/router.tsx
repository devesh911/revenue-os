// Test-only helper: wrap children in a wouter Router pinned to a static SSR location so <Link>
// renders to a plain <a href> under renderToStaticMarkup. `ssrPath` is used deliberately —
// memoryLocation({ static: true }).hook throws "Missing getServerSnapshot" under renderToStaticMarkup
// in wouter 3.10.0 (its location hook uses useSyncExternalStore); ssrPath renders a static location
// with no snapshot needed. Lives under apps/console/ because `wouter` is a console-workspace dep,
// not hoisted to the repo root that the tests/ suite resolves from. Never imported by app code.
import type { ReactNode } from "react";
import { Router } from "wouter";

export function StaticRouter({ children }: { children: ReactNode }) {
  return <Router ssrPath="/">{children}</Router>;
}
