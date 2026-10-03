// What the console shows when it starts (src/app/Boot.tsx, the one thing main.tsx mounts). With its sign-in
// settings missing, all of its code loads without building a sign-in client (a module that built one on load would
// throw "supabaseUrl is required." and leave a blank page) and the configuration screen names each missing
// setting. With them present, the app runs inside its error boundary, so a screen that fails to draw shows
// "Something went wrong" instead of a blank page (the boundary itself: app-error-boundary.test.tsx).
import { expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReactElement } from "react";
import { App } from "../src/app/App";
import { AppErrorBoundary } from "../src/app/AppErrorBoundary";
import { Boot } from "../src/app/Boot";

const consoleDir = join(import.meta.dir, "..");

it("with its sign-in settings missing, the console loads all its code without building a client and names each missing setting", () => {
  // A fresh Bun process, so no module is already loaded (or loaded under another test's fakes), started in an
  // empty folder with no VITE_ settings, so no settings file of this machine fills them in.
  const at = (name: string) =>
    JSON.stringify(Bun.resolveSync(name, consoleDir));
  const start = `
    const { Boot } = await import(${JSON.stringify(join(consoleDir, "src", "app", "Boot.tsx"))});
    const { createElement } = await import(${at("react")});
    const { renderToStaticMarkup } = await import(${at("react-dom/server")});
    process.stdout.write(renderToStaticMarkup(createElement(Boot, { env: {} })));`;
  const empty = mkdtempSync(join(tmpdir(), "console-boot-"));
  try {
    const r = spawnSync(process.execPath, ["-e", start], {
      cwd: empty,
      encoding: "utf8",
      env: Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith("VITE_")),
      ),
    });
    expect({ status: r.status, stderr: r.stderr }).toMatchObject({ status: 0 });
    expect(r.stdout).toContain("Console configuration incomplete");
    expect(r.stdout).toContain("VITE_SUPABASE_URL");
    expect(r.stdout).toContain("VITE_SUPABASE_ANON_KEY");
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

it("with its sign-in settings present, the console runs the app inside its error boundary", () => {
  const shown = Boot({
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_ANON_KEY: "local-anon-key",
    },
  }) as ReactElement<{ children: ReactElement }>;
  expect(shown.type).toBe(AppErrorBoundary);
  expect(shown.props.children.type).toBe(App);
});
