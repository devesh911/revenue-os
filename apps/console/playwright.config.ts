// Playwright e2e for the console — the end-to-end test layer (docs/tech-stack.md T12, with the
// environments in T22). PER-APP config (mirrors apps/console/tsconfig.json) — the repo-root slot
// stays free for the marketing site's own e2e someday (docs/tech-stack.md T15). Driven from root
// via `bun run e2e` (scripts are the interface):
// the script passes `-c apps/console/playwright.config.ts`, and testDir "e2e" resolves beside this
// file → apps/console/e2e.
//
// Two ways to run:
//   - `bun run local bun run e2e` — the REAL local stack (CI's e2e step, and local dev with
//     `supabase start`): the wrapper exports the stack env, so the worker API starts too, the console
//     is built against it, and global-setup.ts seeds the workspace the auth spec signs in to.
//   - `bun run e2e` with no stack env — only the console starts, built with the designed-dummy
//     VITE_ pair (NOT secrets; paired copy in ci.yml's "Console build (dummy env)" step — change
//     both together): the boot smoke passes, the auth spec fails with its own "must be set" error.
//     `-- --list` collects every spec with no browser, no webServer and no global setup.
// e2e specs sit OUTSIDE tsc scope by design (Node-runner vs DOM types); `--list` is their syntax gate.
import { defineConfig, devices } from "@playwright/test";

// Only the local-env wrapper sets VITE_API_URL — the same gate global-setup.ts uses, so a shell that
// merely exports SUPABASE_* (CI's GITHUB_ENV) never starts a worker beside a dummy-env console.
const apiUrl = process.env.VITE_API_URL;
const reuseExistingServer = !process.env.CI; // stale-server landmine otherwise: always fresh in CI

export default defineConfig({
  testDir: "e2e",
  // *.e2e.ts (not .spec./.test.) keeps bun's repo-wide test glob from running this outside Playwright.
  testMatch: "**/*.e2e.ts",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI, // fail CI if a stray test.only was committed
  retries: process.env.CI ? 2 : 0, // 0 locally; trace is captured only on the first CI retry
  reporter: "list",
  use: {
    baseURL: "http://localhost:4173", // vite preview (strictPort in vite.config.ts)
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    // The worker API, from the repo root, on the PORT the wrapper also baked into VITE_API_URL.
    ...(apiUrl
      ? [
          {
            name: "api",
            command: "bun services/worker/src/index.ts",
            cwd: "../..",
            url: `${apiUrl}/health`,
            reuseExistingServer,
            timeout: 60_000,
          },
        ]
      : []),
    // `vite build` inlines VITE_ env (process.env passes through, VITE_API_URL included), so this
    // build carries the real local anon key: it goes to dist-e2e (git- and biome-ignored), never
    // dist/, which CI's no-secrets-in-the-build guard (docs/security.md S7.3) scans for JWT shapes.
    {
      name: "console",
      command:
        "bun run build --outDir dist-e2e && bun run preview --outDir dist-e2e",
      url: "http://localhost:4173",
      reuseExistingServer,
      timeout: 120_000,
      env: {
        VITE_SUPABASE_URL:
          process.env.VITE_SUPABASE_URL || "https://dummy.invalid",
        VITE_SUPABASE_ANON_KEY:
          process.env.VITE_SUPABASE_ANON_KEY || "dummy-not-a-key",
      },
    },
  ],
});
