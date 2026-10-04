// The browser checks' servers (playwright.config.ts, loaded as Playwright loads it): beside the console built with this
// run's settings, they build a second console into its own folder with its sign-in and API settings set empty and
// serve it on port 4175, where e2e/no-settings.e2e.ts sees what a console deployed without its settings shows. Empty,
// not left out: Playwright hands every server this run's own settings, so a setting left out would reach that build.
import { expect, it } from "bun:test";
import checks from "../playwright.config";

it("the browser checks serve a console built with its settings empty on port 4175", () => {
  const servers = [checks.webServer ?? []].flat();
  const bare = servers.find((s) => s.url === "http://localhost:4175");
  expect(bare?.env).toEqual({
    VITE_SUPABASE_URL: "",
    VITE_SUPABASE_ANON_KEY: "",
    VITE_API_URL: "",
  });
  expect(bare?.command).toContain("build --outDir dist-e2e-no-settings");
  expect(bare?.command).toContain(
    "preview --outDir dist-e2e-no-settings --port 4175 --strictPort",
  );
});
