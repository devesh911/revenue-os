// Slice 1's proof, its worker steps, against the local stack: the real worker, started as `bun
// services/worker/src/index.ts` and as the image docker/Dockerfile builds. Its readiness check (/ready) must answer
// ready, fail once its database is taken away (the worker reaches the database through a relay the step cuts) and
// answer ready again once the relay is back; the image must carry the commit it was built from as its label, turn
// healthy through its own health check, and name that commit at /release. Each step holds the local stack's lock
// while its worker runs, as the gate's browser checks do: a worker takes every company's due jobs from the one local
// database (scripts/done-gate/running-workers.ts).

import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { type AddressInfo, connect, createServer, type Socket } from "node:net";
import { onSharedStack } from "../done-gate/shared-stack";
import { git, plainEnv, sh } from "./scratch";
import type { Step } from "./step";

const LOCK_WAIT_MS = 8 * 60_000;
const IMAGE = "revenue-os-worker:proof";
const LABEL = "org.opencontainers.image.revision";

/** The local stack's addresses, as ci.yml and the proof workflow set them, or the local defaults. */
const stack = (env: NodeJS.ProcessEnv) => ({
  db:
    env.DATABASE_URL ||
    "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres",
  supabase: env.SUPABASE_URL || "http://127.0.0.1:54321",
});

/** Polls `look` every half second until it gives a value, or throws `why()` after `ms`. */
async function until<T>(
  look: () => Promise<T | undefined>,
  ms: number,
  why: () => string,
) {
  const ends = Date.now() + ms;
  for (;;) {
    const seen = await look().catch(() => undefined);
    if (seen !== undefined) return seen;
    if (Date.now() > ends) throw new Error(why());
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** A relay on a free local port to `host:port`: `cut` drops every connection and stops listening, `restore` listens again. */
async function relay(host: string, port: number) {
  const sockets = new Set<Socket>();
  const server = createServer((inbound) => {
    const outbound = connect(port, host);
    for (const s of [inbound, outbound]) {
      sockets.add(s);
      s.on("error", () => {});
      s.on("close", () => sockets.delete(s));
    }
    inbound.on("close", () => outbound.destroy());
    outbound.on("close", () => inbound.destroy());
    inbound.pipe(outbound).pipe(inbound);
  });
  const listen = (at: number) =>
    new Promise<number>((ok, fail) => {
      server.once("error", fail);
      server.listen(at, "127.0.0.1", () =>
        ok((server.address() as AddressInfo).port),
      );
    });
  const at = await listen(0);
  return {
    port: at,
    cut: () =>
      new Promise<void>((ok) => {
        for (const s of sockets) s.destroy();
        if (!server.listening) return ok();
        server.close(() => ok());
      }),
    restore: () => listen(at),
  };
}

const freePort = () =>
  new Promise<number>((ok) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => ok(port));
    });
  });

/** A worker's last printed lines, for a failure message. */
const tail = (out: string[]) => out.join("").slice(-1500);

async function stop(worker: ChildProcess) {
  if (worker.exitCode !== null || worker.signalCode !== null) return;
  const gone = new Promise((r) => worker.once("exit", r));
  worker.kill("SIGTERM");
  const late = setTimeout(() => worker.kill("SIGKILL"), 10_000);
  await gone;
  clearTimeout(late);
}

/**
 * Starts the worker at `root` through a relay to the database, cuts the relay and restores it, and says what /ready
 * and /release answered. Run holding the local stack's lock.
 */
async function provesReadiness(root: string, env: NodeJS.ProcessEnv) {
  const { db, supabase } = stack(env);
  const dbUrl = new URL(db);
  const r = await relay(dbUrl.hostname, Number(dbUrl.port || 5432));
  const port = await freePort();
  const token = randomBytes(32).toString("hex");
  const commit = git(root, "rev-parse", "HEAD").trim();
  const out: string[] = [];
  const worker = spawn(
    "bun",
    ["--no-env-file", "services/worker/src/index.ts"],
    {
      cwd: root,
      env: plainEnv({
        DATABASE_URL: db.replace(`@${dbUrl.host}`, `@127.0.0.1:${r.port}`),
        SUPABASE_URL: supabase,
        PORT: String(port),
        READY_TOKEN: token,
        RELEASE: commit,
      }),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  worker.stdout?.on("data", (d) => out.push(String(d)));
  worker.stderr?.on("data", (d) => out.push(String(d)));
  const ask = (path: string, auth = true) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      headers: auth ? { authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(5_000),
    });
  /** /ready's answer once it has `status`, as its status and body. */
  const readyWith = (status: number, ms: number, when: string) =>
    until(
      async () => {
        if (worker.exitCode !== null) throw new Error("exited");
        const res = await ask("/ready");
        return res.status === status ? await res.text() : undefined;
      },
      ms,
      () =>
        worker.exitCode !== null
          ? `the worker exited (code ${worker.exitCode}) ${when}; it printed:\n${tail(out)}`
          : `/ready did not answer ${status} within ${ms / 1000} s ${when}; the worker printed:\n${tail(out)}`,
    );
  try {
    const up = await readyWith(200, 60_000, "after it started");
    const refused = (await ask("/ready", false)).status;
    if (refused !== 401)
      throw new Error(
        `/ready without the ready token answered ${refused}, not 401`,
      );
    await r.cut();
    const down = await readyWith(503, 20_000, "once its database was cut off");
    const body = JSON.parse(down) as { ok?: unknown; unreachable?: unknown };
    if (
      Object.keys(body).join() !== "ok,unreachable" ||
      body.ok !== false ||
      JSON.stringify(body.unreachable) !== '["database","job queue"]'
    )
      throw new Error(
        `with its database cut off /ready answered 503 with ${down}, not {"ok":false,"unreachable":["database","job queue"]}: the worker's own /ready must ask both (its job queue lives in the same database)`,
      );
    await r.restore();
    const back = await readyWith(200, 30_000, "once its database was back");
    const release = await (await ask("/release")).text();
    if (release !== JSON.stringify({ release: commit }))
      throw new Error(
        `/release answered ${release}, not {"release":"${commit}"} alone`,
      );
    return `the worker answered /ready 200 ${up}; 401 without the token; 503 ${down} with its database cut off; 200 ${back} once it was back; /release answered ${release}`;
  } finally {
    await stop(worker);
    await r.cut();
  }
}

export const readyWithoutDatabase: Step = {
  does: "Starts the worker (`bun services/worker/src/index.ts`) on the local stack, reaching its database through a relay, and checks its readiness check: /ready answers 200 once it starts and 401 without the ready token; with the relay cut, so the worker can't reach its database, /ready answers 503 naming exactly the database and the job queue (which lives in the same database), so the worker's own /ready is seen asking both; with the relay back, /ready answers 200 again; and /release names the commit being proved, and nothing else",
  minutes: 15,
  check: ({ root, env }) =>
    onSharedStack(root, () => provesReadiness(root, env), LOCK_WAIT_MS),
};

/** What `docker inspect -f <format>` prints for `what`, or an error saying what docker said. */
function inspect(root: string, format: string, what: string) {
  const r = sh(root, ["docker", "inspect", "-f", format, what]);
  if (r.status !== 0)
    throw new Error(`docker inspect ${what} failed:\n${r.out.slice(-1500)}`);
  return r.stdout.trim();
}

/** Builds the worker image at `root` with its commit, and checks the image's label and health check. */
function buildImage(root: string) {
  const commit = git(root, "rev-parse", "HEAD").trim();
  const built = sh(root, [
    "docker",
    "build",
    "--build-arg",
    `RELEASE=${commit}`,
    "-f",
    "docker/Dockerfile",
    "-t",
    IMAGE,
    ".",
  ]);
  if (built.status !== 0)
    throw new Error(`docker build failed:\n${built.out.slice(-1500)}`);
  const label = inspect(root, `{{ index .Config.Labels "${LABEL}" }}`, IMAGE);
  if (label !== commit)
    throw new Error(`the image's ${LABEL} label is "${label}", not ${commit}`);
  const health = inspect(root, "{{ json .Config.Healthcheck.Test }}", IMAGE);
  if (!health.includes("/ready"))
    throw new Error(`the image's health check does not ask /ready: ${health}`);
  return { commit, label, health };
}

/** Runs the built image on the local stack until Docker reports it healthy, and says what its /release answered. */
async function runImage(
  root: string,
  env: NodeJS.ProcessEnv,
  { commit, label, health }: ReturnType<typeof buildImage>,
) {
  // The container reaches the local stack on the machine running it through host.docker.internal.
  const { db, supabase } = stack(env);
  const onHost = (url: string) =>
    url
      .replace(/@(127\.0\.0\.1|localhost):/, "@host.docker.internal:")
      .replace(/\/\/(127\.0\.0\.1|localhost):/, "//host.docker.internal:");
  const token = randomBytes(32).toString("hex");
  const name = `revenue-os-proof-${randomBytes(4).toString("hex")}`;
  const ran = sh(root, [
    "docker",
    "run",
    "-d",
    "--name",
    name,
    "--add-host",
    "host.docker.internal:host-gateway",
    "-p",
    "127.0.0.1::8080",
    "-e",
    `DATABASE_URL=${onHost(db)}`,
    "-e",
    `SUPABASE_URL=${onHost(supabase)}`,
    "-e",
    `READY_TOKEN=${token}`,
    IMAGE,
  ]);
  try {
    if (ran.status !== 0)
      throw new Error(`docker run failed:\n${ran.out.slice(-1500)}`);
    const logs = () =>
      `its health checks said: ${inspect(root, "{{ json .State.Health.Log }}", name).slice(-1000)}\nit printed: ${sh(root, ["docker", "logs", "--tail", "20", name]).out.slice(-1000)}`;
    await until(
      async () => {
        const status = inspect(root, "{{ .State.Health.Status }}", name);
        if (status === "unhealthy") throw new Error("unhealthy");
        return status === "healthy" ? status : undefined;
      },
      120_000,
      () =>
        `the container did not turn healthy within 120 s (it is ${inspect(root, "{{ .State.Health.Status }}", name)}); ${logs()}`,
    );
    const at = sh(root, ["docker", "port", name, "8080"]).stdout.trim();
    const ask = (auth: boolean) =>
      fetch(`http://${at.split("\n")[0]}/release`, {
        headers: auth ? { authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(5_000),
      });
    const release = await (await ask(true)).text();
    if (release !== JSON.stringify({ release: commit }))
      throw new Error(
        `the container's /release answered ${release}, not {"release":"${commit}"} alone`,
      );
    const refused = (await ask(false)).status;
    if (refused !== 401)
      throw new Error(
        `the container's /release without the ready token answered ${refused}, not 401`,
      );
    return `the image is labelled ${LABEL}=${label}; its health check (${health}) turned the container healthy; its /release answered ${release}, and 401 without the token`;
  } finally {
    sh(root, ["docker", "rm", "-f", name]);
  }
}

export const imageNamesItsCommit: Step = {
  does: `Builds the worker image (docker/Dockerfile) with the commit being proved as its RELEASE, checks the image's ${LABEL} label is that commit and its health check asks /ready, runs it on the local stack with a ready token and waits for Docker to report it healthy, then checks its /release names that commit and nothing else, and refuses a caller without the token`,
  minutes: 20,
  // The build runs no worker, so it waits for no lock and holds none.
  check: ({ root, env }) => {
    const built = buildImage(root);
    return onSharedStack(root, () => runImage(root, env, built), LOCK_WAIT_MS);
  },
};
