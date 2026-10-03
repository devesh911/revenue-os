// What the dev login sees on the seeded workspace (global-setup.ts seeds it), against the real local stack: a
// contact's conversation link opens that conversation's transcript, and the Analytics screen shows the numbers the
// worker's API reports for the workspace, its daily trends included. These replace tests that read the console's
// source code as text (docs/fix-when-touched.md, entry 3). FILENAME: *.e2e.ts, so `bun test` leaves it alone.
import { expect, type Page, test } from "@playwright/test";

function env(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} must be set to run the screens e2e spec`);
  return value;
}

async function signIn(page: Page): Promise<string> {
  const orgId = env("E2E_ORG_ID");
  const { DEV_LOGIN_EMAIL, DEV_LOGIN_PASSWORD } = (await import(
    "../../../scripts/dev-login"
  )) as { DEV_LOGIN_EMAIL: string; DEV_LOGIN_PASSWORD: string };
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(DEV_LOGIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(DEV_LOGIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/o/${orgId}/home$`));
  return orgId;
}

test("a contact's conversation link opens that conversation's transcript", async ({
  page,
}) => {
  const orgId = await signIn(page);
  await page.goto(`/o/${orgId}/contacts`);
  // Asha Verma's seeded voice call (supabase/seeds/real_estate.sql).
  await page.getByRole("link", { name: "Asha Verma", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/o/${orgId}/conversations/[0-9a-f-]{36}$`),
  );
  await expect(
    page.getByText("Hi Asha, this is Riya calling about your 2BHK enquiry", {
      exact: false,
    }),
  ).toBeVisible();
});

test("the Analytics screen shows the workspace's numbers and daily trends as the API reports them", async ({
  page,
}) => {
  const orgId = await signIn(page);
  const from = (path: string) =>
    page.waitForResponse(
      (r) => new URL(r.url()).pathname === `/orgs/${orgId}${path}`,
    );
  const [metricsReply, trendsReply] = [
    from("/metrics"),
    from("/metrics/trends"),
  ];
  await page.goto(`/o/${orgId}/dashboard`);
  const { metrics } = (await (await metricsReply).json()) as {
    metrics: Record<string, number>;
  };
  const { trends } = (await (await trendsReply).json()) as {
    trends: Array<Record<string, number | string>>;
  };

  for (const [label, key] of [
    ["New leads", "new_leads"],
    ["Conversations started", "conversations_started"],
    ["Conversations completed", "conversations_completed"],
    ["Qualified", "qualified"],
    ["Bookings", "bookings"],
    ["Open tasks", "open_tasks"],
  ] as const) {
    const tile = page
      .locator("p", { hasText: new RegExp(`^${label}$`) })
      .first();
    await expect(tile.locator("xpath=following-sibling::p[1]")).toHaveText(
      (metrics[key] ?? Number.NaN).toLocaleString("en-US"),
    );
  }
  // The seed's two open tasks are counted whatever the date.
  expect(metrics.open_tasks).toBeGreaterThanOrEqual(2);

  // Each day with activity is a bar whose title reads "<day>: <count>".
  const active = trends.flatMap((day) =>
    (["new_leads", "conversations_started", "bookings"] as const)
      .filter((key) => Number(day[key]) > 0)
      .map((key) => `${day.day}: ${day[key]}`),
  );
  if (active.length === 0)
    await expect(
      page.getByText("No activity in the last 30 days yet."),
    ).toBeVisible();
  for (const title of active)
    await expect(page.locator(`[title="${title}"]`).first()).toBeAttached();
  expect(trends).toHaveLength(30);
});
