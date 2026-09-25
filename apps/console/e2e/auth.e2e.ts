// Console sign-in front door — browser spec. Runs against the REAL local stack (console +
// worker API + local Supabase), so it proves what the SSR unit suites cannot: a real GoTrue password
// sign-in lands on the first workspace page, a deep link survives the detour through /login, a
// user switch leaves nothing of the previous user's workspace on screen, a foreign workspace URL is
// refused, and a wrong password gets the honest message.
//
// Runtime inputs — read INSIDE each test, so `bun run e2e -- --list` collects with none of them set:
//   E2E_ORG_ID / E2E_ORG_NAME — the seeded workspace the dev login administers;
//   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — to mint a throwaway zero-workspace user through
//     GoTrue sign-up (the anon key is designed-public, and is never printed);
//   DEV_LOGIN_EMAIL / DEV_LOGIN_PASSWORD — exported by scripts/dev-login.ts (imported lazily).
// Every test gets a fresh browser context, i.e. starts signed out. FILENAME: *.e2e.ts, not
// *.spec.ts (see smoke.e2e.ts — bun's repo-wide test glob would otherwise run it).
import { randomUUID } from "node:crypto";
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";

type Credentials = { email: string; password: string };

const FOREIGN_ORG = "00000000-0000-4000-8000-000000000000";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set to run the auth e2e spec`);
  return value;
}

async function devLogin(): Promise<Credentials> {
  const mod = (await import("../../../scripts/dev-login")) as {
    DEV_LOGIN_EMAIL: string;
    DEV_LOGIN_PASSWORD: string;
  };
  return { email: mod.DEV_LOGIN_EMAIL, password: mod.DEV_LOGIN_PASSWORD };
}

// A brand-new confirmed-on-signup local user who belongs to no workspace.
async function zeroOrgUser(request: APIRequestContext): Promise<Credentials> {
  const creds = {
    email: `e2e-noorg-${randomUUID()}@local.test`,
    password: `E2e-${randomUUID()}`,
  };
  const res = await request.post(
    `${env("VITE_SUPABASE_URL").replace(/\/$/, "")}/auth/v1/signup`,
    { headers: { apikey: env("VITE_SUPABASE_ANON_KEY") }, data: creds },
  );
  expect(res.ok(), `GoTrue sign-up returned HTTP ${res.status()}`).toBe(true);
  return creds;
}

async function signIn(page: Page, who: Credentials): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Sign in to Revenue OS" }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(who.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

// Dev login from /login lands on its workspace home, with the workspace named on screen.
test("the dev login signs in from /login and lands on /o/<org>/home", async ({
  page,
}) => {
  const orgId = env("E2E_ORG_ID");
  await page.goto("/login");
  await signIn(page, await devLogin());
  await expect(page).toHaveURL(new RegExp(`/o/${orgId}/home$`));
  await expect(page.locator("body")).toContainText(env("E2E_ORG_NAME"));
});

// A signed-out deep link goes to /login?next=… and comes back to it after sign-in.
test("a signed-out deep link detours through /login with next and returns to it", async ({
  page,
}) => {
  const target = `/o/${env("E2E_ORG_ID")}/contacts`;
  await page.goto(target);
  await expect(page).toHaveURL(
    new RegExp(`/login\\?next=${encodeURIComponent(target)}$`),
  );
  await signIn(page, await devLogin());
  await expect(page).toHaveURL(new RegExp(`${target}$`));
});

// Sign out → plain /login; a zero-workspace user then sees the empty state and nothing
// of the previous user's workspace (the query cache was wiped on the user switch).
test("after sign-out, a zero-workspace user sees the empty state and none of the previous workspace", async ({
  page,
  request,
}) => {
  const orgName = env("E2E_ORG_NAME");
  const noOrg = await zeroOrgUser(request);

  await page.goto("/login");
  await signIn(page, await devLogin());
  await expect(page).toHaveURL(new RegExp(`/o/${env("E2E_ORG_ID")}/home$`));
  await expect(page.locator("body")).toContainText(orgName); // it WAS on screen

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/); // a deliberate sign-out carries no next

  await signIn(page, noOrg);
  await expect(page.getByText("You're not in a workspace yet")).toBeVisible();
  await expect(
    page.getByText("Ask your workspace admin to invite you."),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(orgName);
  expect(await page.content()).not.toContain(orgName); // not even in attributes / hidden nodes
});

// A workspace the dev login is not in → the no-access page, with a way back to its own.
test("the dev login opening a workspace it is not in sees the no-access page", async ({
  page,
}) => {
  const orgId = env("E2E_ORG_ID");
  await page.goto("/login");
  await signIn(page, await devLogin());
  await expect(page).toHaveURL(new RegExp(`/o/${orgId}/home$`));

  await page.goto(`/o/${FOREIGN_ORG}/home`);
  await expect(
    page.getByText("You don't have access to this workspace"),
  ).toBeVisible();
  await expect(
    page.locator(`a[href="/o/${orgId}/home"]`).first(),
  ).toBeVisible();
});

// A wrong password gets the honest message and stays on /login.
test("a wrong password shows 'Email or password is incorrect.' and stays on /login", async ({
  page,
}) => {
  const dev = await devLogin();
  await page.goto("/login");
  await signIn(page, { email: dev.email, password: `${dev.password}-wrong` });
  await expect(page.getByRole("alert")).toHaveText(
    "Email or password is incorrect.",
  );
  await expect(page).toHaveURL(/\/login(\?|$)/);
});
