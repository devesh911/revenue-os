// `bun run see <path> [more paths]` (scripts/done-gate.ts): what a signed-in person sees on each console
// page. Boots the real local stack like the other browser checks (playwright.config.ts), signs in as the
// dev login, and saves per path a full-page .png and a .txt with the final URL, the page's visible text
// and every console error, page error, failed request and HTTP error. ":org" in a path becomes the
// seeded workspace. playwright.config.ts ignores this file unless SEE_PATHS is set.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  DEV_LOGIN_EMAIL,
  DEV_LOGIN_PASSWORD,
} from "../../../scripts/dev-login";

test("see each page as the dev login", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console error: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("requestfailed", (r) =>
    problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`),
  );
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`);
  });

  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(DEV_LOGIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(DEV_LOGIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/o\/[^/]+\/home$/);

  const paths = (process.env.SEE_PATHS ?? "").split(" ").filter(Boolean);
  for (const [i, path] of paths.entries()) {
    problems.length = 0;
    await page.goto(path.replace(":org", process.env.E2E_ORG_ID ?? ":org"));
    await page
      .waitForLoadState("networkidle", { timeout: 10_000 })
      .catch(() => problems.push("still loading after 10 seconds"));
    const file = join(
      process.env.SEE_OUT ?? ".",
      `${i + 1}${path.replace(/\W+/g, "-")}`,
    );
    await page.screenshot({ path: `${file}.png`, fullPage: true });
    const text = await page.locator("body").innerText();
    writeFileSync(
      `${file}.txt`,
      `${page.url()}\n\n${text}\n\nProblems:\n${problems.join("\n") || "none"}\n`,
    );
  }
});
