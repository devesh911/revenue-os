// What the console shows when it starts, which main.tsx mounts. Its settings are checked first: when one is
// missing or empty it shows the configuration screen naming it, instead of a blank page; otherwise it runs the app
// inside its error boundary, so a screen that fails to draw shows "Something went wrong" with a reload button. The
// configuration screen stays outside the boundary: it can't fail. apps/console/test/boot.test.tsx proves both.
import { parseConsoleEnv } from "../lib/env";
import { App } from "./App";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { ConfigErrorScreen } from "./ConfigErrorScreen";

export function Boot({ env }: { env: Record<string, unknown> }) {
  const parsed = parseConsoleEnv(env);
  return parsed.ok ? (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  ) : (
    <ConfigErrorScreen missing={parsed.missing} />
  );
}
