// Boot-honesty smoke for the console (spec §12b · dev-workflow R9 · tech-stack T12 layer 6).
// Asserts ONLY the three things true of BOTH the current boot path AND task-16's rework: the page
// serves, the SPA mounts a non-empty #root (no white screen), and the document title is present.
// Deliberately NOT asserted: any authenticated flow — there are no e2e credentials yet (S7), and
// login is out of scope for a boot smoke; this keeps the spec stable across sibling task changes.
//
// RUNTIME OWNERSHIP: `playwright test --list` collects this spec with no browser and no env, but an
// actual RUN needs VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY at build time. Against TODAY's code with
// no env the app white-screens (lib/supabase.ts createClient throws at module load) so #root stays
// empty and this fails by design — which is exactly why the runtime run is CI-owned until env exists
// in the runner (worktrees have no .env). See playwright.config.ts for the arming residual.
import { expect, test } from "@playwright/test";

test("console boots: mounted, non-empty, titled", async ({ page }) => {
  await page.goto("/");

  // Title lives in static index.html — present regardless of which boot path renders.
  await expect(page).toHaveTitle("Revenue OS Console");

  // A non-empty #root means the React app actually mounted (no white screen).
  await expect(page.locator("#root")).not.toBeEmpty();
});
