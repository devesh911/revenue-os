// Boot-honesty smoke for the console (spec §12b · dev-workflow R9 · tech-stack T12 layer 6).
// Asserts ONLY the three things true of BOTH the current boot path AND task-16's rework: the page
// serves, the SPA mounts a non-empty #root (no white screen), and the document title is present.
// Deliberately NOT asserted: any authenticated flow — there are no e2e credentials yet (S7), and
// login is out of scope for a boot smoke; this keeps the spec stable across sibling task changes.
//
// FILENAME: *.e2e.ts (NOT *.spec.ts) — `bun test` sweeps **/*.spec.ts repo-wide and would execute
// this outside the Playwright runner (runner collision); playwright.config.ts testMatch keys off it.
//
// RUNTIME: `bun run e2e -- --list` collects this spec with no browser and no webServer (the wiring
// gate). A real RUN needs browsers once (`bunx playwright install`) but NO .env: without VITE_ env the
// console white-screens (lib/supabase.ts createClient throws at module load), so playwright.config.ts's
// webServer injects the designed-dummy VITE_ pair and the app boots to the login screen, filling #root.
// This session installs no browsers; CI arming of the e2e job is a follow-up. See playwright.config.ts.
import { expect, test } from "@playwright/test";

test("console boots: mounted, non-empty, titled", async ({ page }) => {
  await page.goto("/");

  // Title lives in static index.html — present regardless of which boot path renders.
  await expect(page).toHaveTitle("Revenue OS Console");

  // A non-empty #root means the React app actually mounted (no white screen).
  await expect(page.locator("#root")).not.toBeEmpty();
});
