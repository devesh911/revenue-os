// The browser checks' real Playwright settings (../../playwright.config.ts: its retries and its rule for a test that
// passes only on a retry) without their servers, browsers or setup, so ../flaky-retry.test.ts can run one flaky test.
import { defineConfig } from "@playwright/test";
import checks from "../../playwright.config";

export default defineConfig({
  ...checks,
  testDir: ".",
  testMatch: "passes-on-retry.e2e.ts",
  testIgnore: [],
  globalSetup: undefined,
  webServer: undefined,
  projects: [{ name: "retry-proof" }],
});
