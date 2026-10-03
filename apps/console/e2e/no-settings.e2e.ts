// What a console deployed with its settings missing shows, in a real browser: the configuration screen naming each
// missing setting, never a blank page (the white screen of #49). playwright.config.ts builds this console with its
// settings empty and serves it on port 4175. Its entry, src/main.tsx, mounts src/app/Boot.tsx, which checks the
// settings first; an entry that mounted the app without that check would build its sign-in client with no address
// and show nothing, which fails this check. FILENAME: *.e2e.ts, so `bun test` leaves it alone.
import { expect, test } from "@playwright/test";

test("a console built without its settings shows the configuration screen naming each one", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:4175/");
  await expect(
    page.getByRole("heading", { name: "Console configuration incomplete" }),
  ).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveText([
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_API_URL",
  ]);
  expect(errors).toEqual([]);
});
