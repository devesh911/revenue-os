// Every check the gate runs on the code as it stands: typecheck, lint, guards, tests, database policies and the
// browser checks, the database ones one run at a time.

import { spawnSync } from "node:child_process";
import { type AddressInfo, createConnection, createServer } from "node:net";
import { onSharedStack } from "./shared-stack";

type Check = {
  name: string;
  cmd: [string, ...string[]];
  db?: true;
  browser?: true;
};

const CHECKS: Check[] = [
  { name: "typecheck", cmd: ["bun", "run", "typecheck"] },
  { name: "lint", cmd: ["bun", "run", "lint"] },
  { name: "guards", cmd: ["bun", "run", "guards"] },
  {
    name: "tests",
    cmd: ["bun", "run", "local", "bun", "run", "gate", "tests"],
    db: true,
  },
  {
    name: "tests proven",
    cmd: ["bun", "run", "local", "bun", "run", "gate", "proven"],
    db: true,
  },
  { name: "database policies", cmd: ["bun", "run", "rls:check"], db: true },
  {
    name: "browser checks",
    cmd: ["bun", "run", "local", "bun", "run", "gate", "tests", "e2e"],
    db: true,
    browser: true,
  },
];

const reachable = (port: number) =>
  new Promise<boolean>((done) => {
    const s = createConnection({ port, host: "127.0.0.1", timeout: 500 });
    const end = (up: boolean) => {
      s.destroy();
      done(up);
    };
    s.once("connect", () => end(true));
    s.once("error", () => end(false));
    s.once("timeout", () => end(false));
  });

const freePort = () =>
  new Promise<number>((done) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => done(port));
    });
  });

export function run(
  repo: string,
  [bin, ...args]: [string, ...string[]],
  env: Record<string, string> = {},
) {
  const r = spawnSync(bin, args, {
    cwd: repo,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 256 << 20,
  });
  return {
    status: r.status ?? 1,
    out: Bun.stripANSI(`${r.stdout ?? ""}${r.stderr ?? ""}`),
  };
}

/** Browser runs start fresh servers (CI=1) and put the worker on a free port. */
export const browserEnv = async () => ({
  PORT: String(await freePort()),
  CI: "1",
});

export const tail = (out: string, lines = 60) =>
  out.trimEnd().split("\n").slice(-lines).join("\n");
const tally = (name: string, out: string) => {
  const n = out.match(/(\d+) pass(ed)?\b/)?.[1];
  return n ? `${n} ${name}` : name;
};

export const noDocker = () =>
  spawnSync("docker", ["--version"]).error !== undefined;

/** `complete`: every check ran. Without Docker on this machine the database checks are left to CI. */
export async function runChecks(
  repo: string,
): Promise<{ ok: boolean; text: string; complete?: boolean }> {
  const dbUp = await reachable(54322);
  const docker = dbUp
    ? undefined
    : spawnSync("docker", ["info"], { stdio: "ignore" });
  if (docker && !docker.error)
    return {
      ok: false,
      text:
        docker.status === 0
          ? "the local database is not running, so the tests can't run. Start it with `supabase start`, then stop again."
          : "Docker is installed but not running, so the tests can't run. Start Docker Desktop, then `supabase start`, then stop again.",
    };
  const passed: string[] = [];
  /** The first failure, or nothing when every check passes. */
  const runEach = async (checks: Check[]) => {
    for (const c of checks) {
      const r = run(repo, c.cmd, c.browser ? await browserEnv() : {});
      if (r.status !== 0)
        return `${c.name} failed (\`${c.cmd.join(" ")}\`):\n${tail(r.out)}`;
      passed.push(tally(c.name, r.out));
    }
  };
  const onDb = CHECKS.filter((c) => c.db);
  const failed =
    (await runEach(CHECKS.filter((c) => !c.db))) ??
    (dbUp
      ? await onSharedStack(repo, () => runEach(onDb)).catch(
          (e: Error) =>
            `${onDb.map((c) => c.name).join(", ")} did not run: ${e.message}`,
        )
      : undefined);
  if (failed) return { ok: false, text: failed };
  if (!dbUp)
    passed.push(
      "NOT run here (no Docker): tests, database policies, browser checks; CI runs them",
    );
  return { ok: true, text: passed.join(", "), complete: dbUp };
}
