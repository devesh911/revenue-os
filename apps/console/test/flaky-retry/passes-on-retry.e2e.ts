// Fails its first try and passes its retry: the flaky browser test ../flaky-retry.test.ts expects the CI run to
// reject. It uses no page, so no browser starts. It lives outside the browser checks' folders, so only that test runs it.
import { expect, test } from "@playwright/test";

test("passes only on a retry", () => {
  expect(test.info().retry).toBeGreaterThan(0);
});
