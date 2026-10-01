// Browser check that the landing page's typefaces are its own: Lora and IBM Plex Mono
// load, and every font the page fetches comes from the site itself, so no font host
// sees a visitor. Runs against a production build (the "www" project in
// apps/console/playwright.config.ts, part of `bun run e2e`).
import { expect, test } from "@playwright/test";

test("Lora and IBM Plex Mono load, from the site itself, with no face failing", async ({
  page,
}) => {
  const fetched: string[] = [];
  const failed: string[] = [];
  page.on("response", (r) => {
    if (r.request().resourceType() !== "font") return;
    fetched.push(r.url());
    if (!r.ok()) failed.push(`${r.status()} ${r.url()}`);
  });
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    const faces = [...document.fonts];
    return {
      families: faces
        .filter((f) => f.status === "loaded")
        .map((f) => f.family.replace(/^["']|["']$/g, "")),
      // a face the page asked for whose file is missing or broken
      errors: faces
        .filter((f) => f.status === "error")
        .map((f) => `${f.family} ${f.style} ${f.weight}`),
    };
  });
  expect(loaded.families).toEqual(
    expect.arrayContaining(["Lora", "IBM Plex Mono"]),
  );
  expect(loaded.errors).toEqual([]);
  expect(failed).toEqual([]);
  expect(fetched.length).toBeGreaterThan(0);
  const site = new URL(page.url()).origin;
  for (const url of fetched) expect(new URL(url).origin, url).toBe(site);
});
