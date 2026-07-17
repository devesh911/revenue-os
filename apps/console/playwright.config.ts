// Playwright smoke harness for the console (spec §12b · tech-stack T12 layer 6 / T22).
// PER-APP config (mirrors apps/console/tsconfig.json) — the repo-root slot stays free for apps/www's
// own e2e someday (tech-stack T15). Driven from root via `bun run e2e` (scripts are the interface):
// the script passes `-c apps/console/playwright.config.ts`, and testDir "e2e" resolves beside this
// file → apps/console/e2e.
//
// SCAFFOLD — wiring, not arming. Honest status:
//   - `bun run e2e -- --list` collects the spec with no browser and no webServer — the wiring proof
//     the VERIFY step runs. e2e specs sit OUTSIDE tsc scope by design (Node-runner vs DOM types);
//     `--list` is their syntax gate, and a dedicated e2e tsconfig rides the CI-arming follow-up.
//   - A real RUN needs browsers once (`bunx playwright install`) but NO .env: the webServer `env`
//     below injects the SAME public designed-dummy VITE_ pair that ci.yml's "Console build (dummy
//     env)" step uses (NOT secrets). Change the two copies together.
//   - This scaffold does NOT arm .github/workflows/ci.yml; wiring the `e2e` job is a follow-up.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI, // fail CI if a stray test.only was committed
  retries: process.env.CI ? 2 : 0, // 0 locally; trace is captured only on the first CI retry
  reporter: "list",
  use: {
    baseURL: "http://localhost:4173", // vite preview default port
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Build the console, then serve the static preview; reuse a local server, always fresh in CI.
  webServer: {
    command:
      "bun run --filter console build && bun run --filter console preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI, // stale-server-on-4173 landmine otherwise
    timeout: 120_000,
    // Designed-public dummies (NOT secrets) — paired copy lives in ci.yml's "Console build (dummy
    // env)" step. `vite build` inlines VITE_ env, so this averts the white-screen trap and makes
    // `bun run e2e` locally runnable with no .env. Change both copies together.
    env: {
      VITE_SUPABASE_URL: "https://dummy.invalid",
      VITE_SUPABASE_ANON_KEY: "dummy-not-a-key",
    },
  },
});
