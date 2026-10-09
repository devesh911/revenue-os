// PATCH /orgs/:orgId renames a company, and only that company's own admin may: the route asks the caller's role
// (memberRole) and answers anyone else 403 {"error":"forbidden"} (services/worker/src/routes/orgs.ts). The admin's
// own rename is checked in audit.test.ts; here every other caller is refused and the company keeps its name.
// Real users, made locally and signed in through the local sign-in server (accounts are invite-only), jose-verified
// tokens, the app_service database path underneath: runs with the local stack's settings (`bun run gate`, CI).
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import pg from "pg";
import { testCompanies } from "../../../tests/test-companies";
import { type TestUser, testUser } from "../../../tests/test-users";
import app from "../src/index";

const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 1,
});
const companies = testCompanies(admin);

function api(path: string, token: string | null, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  return app.fetch(
    new Request(`http://localhost${path}`, { ...init, headers }),
  );
}

/** A company made through the product's own POST /orgs, which makes `token`'s user its admin. */
async function createOrg(token: string, label: string): Promise<string> {
  const { id } = await companies.add(label, async (name, slug) => {
    const res = await api("/orgs", token, {
      method: "POST",
      body: JSON.stringify({ name, slug }),
    });
    return ((await res.json()) as { id: string }).id;
  });
  return id;
}

async function invite(orgId: string, userId: string, role: string) {
  const res = await api(`/orgs/${orgId}/members`, adminA.token, {
    method: "POST",
    body: JSON.stringify({ userId, role }),
  });
  if (res.status !== 201)
    throw new Error(`invite ${role} failed: ${res.status}`);
}

const nameOf = async (orgId: string) =>
  (
    await admin.query<{ name: string }>(`select name from orgs where id = $1`, [
      orgId,
    ])
  ).rows[0]?.name;

let adminA: TestUser; // company A's admin
let adminB: TestUser; // company B's admin, a stranger to company A
let operator: TestUser; // company A's operator
let viewer: TestUser; // company A's viewer
let outsider: TestUser; // signed in, in no company
let orgA = "";
let nameA = "";

/** `token`'s attempt to rename company A: the reply, and company A's name afterwards. */
async function renameA(token: string | null) {
  const res = await api(`/orgs/${orgA}`, token, {
    method: "PATCH",
    body: JSON.stringify({ name: "Renamed by someone else" }),
  });
  return {
    status: res.status,
    body: await res.json(),
    name: await nameOf(orgA),
  };
}

beforeAll(async () => {
  adminA = await testUser(admin, "rename-admin-a", { operator: true });
  adminB = await testUser(admin, "rename-admin-b", { operator: true });
  operator = await testUser(admin, "rename-op");
  viewer = await testUser(admin, "rename-viewer");
  outsider = await testUser(admin, "rename-outsider");

  orgA = await createOrg(adminA.token, "Rename A");
  await createOrg(adminB.token, "Rename B");
  nameA = (await nameOf(orgA)) ?? "";
  await invite(orgA, operator.userId, "operator");
  await invite(orgA, viewer.userId, "viewer");
});

afterAll(async () => {
  await companies.cleanup();
  await admin.end();
});

describe("PATCH /orgs/:orgId: only the company's own admin may rename it", () => {
  const forbidden = () => ({
    status: 403,
    body: { error: "forbidden" },
    name: nameA,
  });

  // behaviour already on main: the rename route answers 403 to any caller who is not the company's admin
  it("another company's admin gets 403, and the name is unchanged", async () => {
    expect(await renameA(adminB.token)).toEqual(forbidden());
  });

  // behaviour already on main: the rename route answers 403 to any caller who is not the company's admin
  it("the company's own operator gets 403, and the name is unchanged", async () => {
    expect(await renameA(operator.token)).toEqual(forbidden());
  });

  // behaviour already on main: the rename route answers 403 to any caller who is not the company's admin
  it("the company's own viewer gets 403, and the name is unchanged", async () => {
    expect(await renameA(viewer.token)).toEqual(forbidden());
  });

  // behaviour already on main: the rename route answers 403 to any caller who is not the company's admin
  it("a signed-in person in no company gets 403, and the name is unchanged", async () => {
    expect(await renameA(outsider.token)).toEqual(forbidden());
  });

  // behaviour already on main: the sign-in check answers 401 to a request with no token on every route but the public ones
  it("a request with no sign-in token gets 401, and the name is unchanged", async () => {
    expect(await renameA(null)).toEqual({
      status: 401,
      body: { error: "unauthorized" },
      name: nameA,
    });
  });
});
