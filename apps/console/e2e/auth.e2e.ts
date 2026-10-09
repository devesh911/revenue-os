// Console sign-in front door — browser spec. Runs against the REAL local stack (console +
// worker API + local Supabase), so it proves what the SSR unit suites cannot: a real GoTrue password
// sign-in lands on the first workspace page, a deep link survives the detour through /login, a
// user switch leaves nothing of the previous user's workspace on screen, a foreign workspace URL is
// refused, and a wrong password gets the honest message.
//
// Runtime inputs — read INSIDE each test, so `bun run e2e -- --list` collects with none of them set:
//   E2E_ORG_ID / E2E_ORG_NAME — the seeded workspace the dev login administers;
//   LOCAL_DB_URL — the local database as its superuser, to make a throwaway zero-workspace user there and sign it
//     in (accounts are invite-only: the sign-in server refuses a self sign-up), as the dev login is made;
//   DEV_LOGIN_EMAIL / DEV_LOGIN_PASSWORD — exported by scripts/dev-login.ts (imported lazily).
// Every test gets a fresh browser context, i.e. starts signed out. FILENAME: *.e2e.ts, not
// *.spec.ts (see smoke.e2e.ts — bun's repo-wide test glob would otherwise run it).
import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { ensureLocalUser } from "../../../scripts/dev-login";
import { isLocalUrl } from "../../../scripts/local-url";

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

// A brand-new local user, made in the local database, who belongs to no workspace and is not an operator.
async function zeroOrgUser(): Promise<Credentials> {
  const dbUrl = env("LOCAL_DB_URL");
  if (!isLocalUrl(dbUrl))
    throw new Error(
      "the auth e2e spec makes users only in a database on this machine",
    );
  const creds = {
    email: `e2e-noorg-${randomUUID()}@local.test`,
    password: `E2e-${randomUUID()}`,
  };
  const db = new pg.Pool({ connectionString: dbUrl });
  try {
    await ensureLocalUser(db, creds.email, creds.password);
  } finally {
    await db.end();
  }
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
}) => {
  const orgName = env("E2E_ORG_NAME");
  const noOrg = await zeroOrgUser();

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
