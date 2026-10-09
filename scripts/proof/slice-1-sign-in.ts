// Slice 1's proof, its invite-only step, against the local stack: the real sign-in server refuses a self sign-up, and
// the real worker (`bun services/worker/src/index.ts`) refuses a signed-in stranger, someone not on our operator
// list, who creates a company, as does the database's own data interface; no login and no company is made. The
// stranger's login is made as the local seed makes one (scripts/dev-login.ts), since sign-up is off. The step holds
// the local stack's lock while its worker runs, as the worker steps do (slice-1-worker.ts).

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { ensureLocalUser } from "../dev-login";
import { onSharedStack } from "../done-gate/shared-stack";
import { buildLocalEnv } from "../local-env";
import { plainEnv, sh } from "./scratch";
import {
  freePort,
  LOCK_WAIT_MS,
  localStack,
  stop,
  tail,
  until,
} from "./slice-1-worker";
import type { Step } from "./step";

/**
 * The local stack's settings: the proof workflow sets them; on this machine they are read from the running stack.
 * Refused unless on this machine, with app_service's login on (localStack).
 */
async function settings(root: string, env: NodeJS.ProcessEnv) {
  const known = env.SUPABASE_ANON_KEY && env.LOCAL_DB_URL;
  const local = known
    ? {}
    : buildLocalEnv(sh(root, ["supabase", "status", "-o", "env"]).stdout, env);
  const all = { ...env, ...local };
  return {
    ...(await localStack(all)),
    anonKey: all.SUPABASE_ANON_KEY ?? "",
  };
}

/** Run holding the local stack's lock: what the sign-in server, the worker and the data interface answered. */
async function provesInviteOnly(root: string, env: NodeJS.ProcessEnv) {
  const s = await settings(root, env);
  const owner = new pg.Client({ connectionString: s.owner });
  await owner.connect();
  const rows = async (sql: string, value: string) =>
    (await owner.query(sql, [value])).rowCount ?? 0;
  const auth = (path: string, body: unknown, token?: string) =>
    fetch(`${s.supabase}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: s.anonKey,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  const out: string[] = [];
  let worker: ReturnType<typeof spawn> | undefined;
  try {
    const self = `proof-self-signup-${randomUUID()}@example.com`;
    const signup = await auth("/auth/v1/signup", {
      email: self,
      password: `proof-${randomUUID()}`,
    });
    const signupSaid = await signup.text();
    if (signup.status !== 422 || !signupSaid.includes("signup_disabled"))
      throw new Error(
        `a self sign-up answered ${signup.status} ${signupSaid.slice(0, 200)}, not 422 signup_disabled`,
      );
    if (await rows(`select 1 from auth.users where email = $1`, self))
      throw new Error(`a self sign-up made the login ${self}`);

    const email = `proof-stranger-${randomUUID()}@example.com`;
    const password = `proof-${randomUUID()}`;
    await ensureLocalUser(owner, email, password);
    const grant = await auth("/auth/v1/token?grant_type=password", {
      email,
      password,
    });
    const { access_token: token } = (await grant.json()) as {
      access_token?: string;
    };
    if (!token)
      throw new Error(
        `the stranger's login could not sign in (HTTP ${grant.status})`,
      );

    const port = await freePort();
    worker = spawn("bun", ["--no-env-file", "services/worker/src/index.ts"], {
      cwd: root,
      env: plainEnv({
        DATABASE_URL: s.db,
        SUPABASE_URL: s.supabase,
        PORT: String(port),
      }),
      stdio: ["ignore", "pipe", "pipe"],
    });
    worker.stdout?.on("data", (d) => out.push(String(d)));
    worker.stderr?.on("data", (d) => out.push(String(d)));
    const running = worker;
    await until(
      async () => {
        if (running.exitCode !== null) throw new Error("exited");
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        return res.ok ? true : undefined;
      },
      60_000,
      () =>
        `the worker did not answer /health within 60 s; it printed:\n${tail(out)}`,
    );
    const slug = `proof-stranger-${randomUUID()}`;
    const create = (auth?: string) =>
      fetch(`http://127.0.0.1:${port}/orgs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(auth ? { authorization: `Bearer ${auth}` } : {}),
        },
        body: JSON.stringify({ name: "A stranger's company", slug }),
        signal: AbortSignal.timeout(10_000),
      });
    const anonymous = await create();
    const stranger = await create(token);
    const strangerSaid = await stranger.text();
    const direct = await fetch(`${s.supabase}/rest/v1/orgs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: s.anonKey,
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "A stranger's company", slug }),
      signal: AbortSignal.timeout(10_000),
    });
    const made = await rows(`select 1 from orgs where slug = $1`, slug);
    if (anonymous.status !== 401)
      throw new Error(
        `POST /orgs without sign-in answered ${anonymous.status}, not 401`,
      );
    if (
      stranger.status !== 403 ||
      strangerSaid !== JSON.stringify({ error: "not_an_operator" })
    )
      throw new Error(
        `POST /orgs by a signed-in stranger answered ${stranger.status} ${strangerSaid.slice(0, 200)}, not 403 {"error":"not_an_operator"}`,
      );
    if (direct.ok)
      throw new Error(
        `the data interface let a signed-in stranger insert a company (HTTP ${direct.status})`,
      );
    if (made)
      throw new Error(`a company was made under the stranger's slug ${slug}`);
    return `a self sign-up answered 422 signup_disabled and made no login; POST /orgs answered 401 without sign-in and 403 {"error":"not_an_operator"} to a signed-in stranger; the data interface refused the stranger's insert (HTTP ${direct.status}); no company was made`;
  } finally {
    if (worker) await stop(worker);
    await owner.end();
  }
}

export const signUpAndStrangerRefused: Step = {
  does: "Asks the local sign-in server for a self sign-up and checks it answers 422 signup_disabled and makes no login; then makes a login for a stranger (not on our operator list) as the local seed makes one, starts the worker (`bun services/worker/src/index.ts`) and checks POST /orgs answers 401 without sign-in and 403 not_an_operator to the stranger, that the database's data interface refuses the stranger's insert into the companies table, and that no company was made",
  minutes: 10,
  check: ({ root, env }) =>
    onSharedStack(root, () => provesInviteOnly(root, env), LOCK_WAIT_MS),
};
