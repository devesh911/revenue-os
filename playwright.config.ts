// Playwright smoke harness for the console (spec §12b · tech-stack T12 layer 6 / T22).
// SCAFFOLD ONLY — wiring, not arming. Honest status:
//   - `bunx playwright test --list` collects the spec with no browser and no env — the wiring proof
//     the VERIFY step runs. It loads this config but does NOT start `webServer` or launch a browser.
//   - An actual RUN additionally needs (a) `playwright install` browsers and (b) VITE_SUPABASE_URL /
//     VITE_SUPABASE_ANON_KEY at BUILD time. Without them the console white-screens
//     (apps/console/src/lib/supabase.ts createClient throws at module load), so the boot-honesty
//     assertions fail. Worktrees carry no .env, so the runtime run is CI-owned — a declared residual.
//   - This scaffold does NOT arm .github/workflows/ci.yml; wiring the `e2e` job is a follow-up.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "apps/console/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI, // fail CI if a stray test.only was committed
  retries: process.env.CI ? 2 : 0, // 0 locally; trace is captured only on the first CI retry
  reporter: "list",
  use: {
    baseURL: "http://localhost:4173", // vite preview default port
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Build the console, then serve the static preview; reuse a server already up locally.
  // `vite build` inlines VITE_ env — the arming residual noted above lives at this build step.
  webServer: {
    command:
      "bun run --filter console build && bun run --filter console preview",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
