// Every stop judges what changed and says what it did not run. Each test drives the real hook in a throwaway
// repository holding a copy of the gate, its origin/main at its first commit, as a session's stop would. Its checks
// are the repository's own package.json scripts, which only say that they ran (the ones on the database also leave a
// mark in the git folder), and a machine without Docker is one whose `docker` can't run.
import { afterAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  constants,
  copyFileSync,
  cpSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  removeTranscripts,
  runHook,
  verifierRun,
} from "./done-gate-verifier-run";

const GATE = join(import.meta.dir, "done-gate.ts");
// A stop starts bun and git a dozen times, and some run every check; with other agents busy that passes bun's 5 s.
setDefaultTimeout(60_000);
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  removeTranscripts();
});
const scratch = (name: string) => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), name)));
  dirs.push(d);
  return d;
};
const sh = (dir: string, cmd: string[]) =>
  spawnSync(cmd[0] as string, cmd.slice(1), { cwd: dir, encoding: "utf8" });
const write = (dir: string, file: string, body: string) => {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), body);
};
const commit = (dir: string) => {
  sh(dir, ["git", "add", "-A"]);
  sh(dir, [
    "git",
    "-c",
    "user.email=t@t",
    "-c",
    "user.name=t",
    "commit",
    "-qm",
    "x",
  ]);
};

// The checks `bun run gate` runs, as package.json scripts that only say they ran; the three on the database (tests,
// database policies, browser checks) each add a line to RAN, in the git folder, so no snapshot sees it.
const RAN = ".git/database-checks-ran";
const SCRIPTS = {
  typecheck: "echo typed",
  lint: "echo linted",
  guards: "echo guarded",
  "rls:check": `echo policies >> ${RAN}`,
  local: `echo tests >> ${RAN}; echo 3 pass; true`, // `bun run local bun run gate tests [e2e]`
};
const databaseChecksRan = (dir: string) =>
  existsSync(join(dir, RAN))
    ? readFileSync(join(dir, RAN), "utf8").trim().split("\n").length
    : 0;

/** A throwaway repository on `main` holding a copy of the gate and SCRIPTS, origin/main at its first commit. */
function repo() {
  const dir = scratch("done-gate-stop-");
  mkdirSync(join(dir, "scripts"));
  copyFileSync(GATE, join(dir, "scripts", "done-gate.ts"));
  cpSync(
    join(import.meta.dir, "done-gate"),
    join(dir, "scripts", "done-gate"),
    { recursive: true },
  );
  write(
    dir,
    "docs/tracker/parse.js",
    readFileSync(
      join(import.meta.dir, "..", "docs", "tracker", "parse.js"),
      "utf8",
    ),
  );
  write(dir, "STATE.md", "# State\n");
  write(dir, "package.json", JSON.stringify({ scripts: SCRIPTS }));
  sh(dir, ["git", "init", "-q", "-b", "main"]);
  commit(dir);
  sh(dir, ["git", "update-ref", "refs/remotes/origin/main", "HEAD"]);
  return dir;
}

/** Someone else's branch, made before the session starts: a commit main does not hold, with a rule problem. */
const theirBranch = (dir: string, branch: string) => {
  sh(dir, ["git", "checkout", "-qb", branch]);
  write(dir, "services/worker/src/theirs.ts", "// @ts-ignore\n");
  commit(dir);
  sh(dir, ["git", "checkout", "-q", "main"]);
};
const RULE_PROBLEM =
  "services/worker/src/theirs.ts:1 switches the type checker off";

const start = (dir: string) =>
  runHook(GATE, dir, { hook_event_name: "SessionStart" });
const stop = (
  dir: string,
  input: Record<string, unknown> = {},
  env: Record<string, string> = {},
) => {
  const { out } = runHook(
    GATE,
    dir,
    { hook_event_name: "Stop", ...input },
    env,
  );
  return {
    sentBack: out.decision === "block",
    told: out.systemMessage ?? "",
    reason: out.reason ?? "",
  };
};
const QUIET = { sentBack: false, told: "", reason: "" };
const verified = (dir: string, note: string, ruling = "PASS") =>
  verifierRun(GATE, dir, { report: `Ruling: ${ruling} — ${note}` });

describe("a stop judges a checkout whose latest commit main does not hold, however it got there", () => {
  it("judges work the session committed after it switches to main and back", () => {
    const dir = repo();
    start(dir);
    sh(dir, ["git", "checkout", "-qb", "feat/mine"]);
    write(dir, "services/worker/src/mine.ts", "// @ts-ignore\n");
    commit(dir);
    sh(dir, ["git", "checkout", "-q", "main"]);
    sh(dir, ["git", "checkout", "-q", "feat/mine"]);
    const r = stop(dir);
    expect(r.sentBack).toBe(true);
    expect(r.reason).toContain(
      "services/worker/src/mine.ts:1 switches the type checker off",
    );
  });

  it("judges a checkout reset to another branch's commit", () => {
    const dir = repo();
    theirBranch(dir, "feat/theirs");
    start(dir);
    sh(dir, ["git", "checkout", "-qb", "feat/mine"]);
    sh(dir, ["git", "reset", "-q", "--hard", "feat/theirs"]);
    const r = stop(dir);
    expect(r.sentBack).toBe(true);
    expect(r.reason).toContain(RULE_PROBLEM);
  });

  it("judges a checkout fast-forwarded, or switched, to a commit main does not hold", () => {
    const dir = repo();
    theirBranch(dir, "feat/theirs");
    start(dir);
    sh(dir, ["git", "checkout", "-qb", "feat/mine"]);
    sh(dir, ["git", "merge", "-q", "--ff-only", "feat/theirs"]);
    expect(stop(dir).reason).toContain(RULE_PROBLEM);

    const other = repo();
    theirBranch(other, "feat/theirs");
    start(other);
    sh(other, ["git", "checkout", "-q", "feat/theirs"]); // to read a pull request: check it out in a worktree of its own
    expect(stop(other).reason).toContain(RULE_PROBLEM);
  });

  it("does not judge a checkout whose latest commit is on origin/main: a pull, or a switch back to main", () => {
    const dir = repo();
    start(dir);
    theirBranch(dir, "teammate");
    sh(dir, ["git", "update-ref", "refs/remotes/origin/main", "teammate"]); // merged on GitHub while the session ran
    sh(dir, ["git", "merge", "-q", "--ff-only", "origin/main"]); // the session pulls main
    expect(stop(dir)).toEqual(QUIET);

    sh(dir, ["git", "checkout", "-qb", "feat/mine"]);
    write(dir, "services/worker/src/mine.ts", "// @ts-ignore\n");
    commit(dir);
    expect(stop(dir).sentBack).toBe(true); // its own work, judged
    sh(dir, ["git", "checkout", "-q", "main"]); // and set aside: main's code is not the session's to answer for
    expect(stop(dir)).toEqual(QUIET);
  });
});

describe("while background work runs, a stop still judges the done rules and the verifier; only the database checks wait", () => {
  const BACKGROUND = { background_tasks: [{ id: "t1", type: "shell" }] };
  const WAITING =
    "Done gate ⏳ NOT fully checked yet: tests, database policies and browser checks wait while background work runs; the first stop after it ends runs them";

  it("sends the agent back on a rule problem", () => {
    const dir = repo();
    write(dir, "services/worker/src/a.ts", "// @ts-ignore\n");
    const r = stop(dir, BACKGROUND);
    expect(r.sentBack).toBe(true);
    expect(r.reason).toContain(
      "services/worker/src/a.ts:1 switches the type checker off",
    );
  });

  it("runs typecheck, lint and guards, leaves the database checks for the first stop after it ends, and says so", () => {
    const dir = repo();
    write(dir, "docs/notes.md", "hello\n");
    expect(stop(dir, BACKGROUND)).toEqual({ ...QUIET, told: WAITING });
    expect(databaseChecksRan(dir)).toBe(0);
    expect(stop(dir, { session_crons: [{ id: "c1" }] })).toEqual({
      ...QUIET,
      told: WAITING,
    }); // a scheduled job counts too, and the change was not taken as checked
    expect(stop(dir)).toEqual({
      ...QUIET,
      told: "Done gate ✓ typecheck, lint, guards, 3 tests, database policies, 3 browser checks (no product code changed, so no verifier needed)",
    });
    expect(databaseChecksRan(dir)).toBe(3);
    expect(stop(dir)).toEqual(QUIET);
  });

  it("still asks for the verifier on product code, and shows its PASS without a ✓", () => {
    const dir = repo();
    start(dir);
    write(dir, "services/worker/src/route.ts", "const route = 1;\n");
    const r = stop(dir, BACKGROUND);
    expect(r.sentBack).toBe(true);
    expect(r.reason).toContain(
      'Run the verifier agent (Agent tool, subagent_type "verifier")',
    );
    verified(dir, "saw the route answer 200");
    expect(stop(dir, BACKGROUND)).toEqual({
      ...QUIET,
      told: `${WAITING} · verifier PASS: saw the route answer 200`,
    });
    expect(databaseChecksRan(dir)).toBe(0);
  });
});

describe("a stop on a machine without Docker says what did not run, never with a ✓", () => {
  const HERE =
    "Done gate ⚠ NOT fully checked: tests, database policies and browser checks did not run here; CI runs them";
  /**
   * A `docker` that can't run, as on a machine where Docker is not installed, first on the PATH the gate sets: bun's
   * own folder leads it (scripts/done-gate.ts), so bun runs from beside it, as Homebrew may install a real docker
   * beside a real bun.
   */
  const noDocker = () => {
    const bin = scratch("no-docker-");
    write(bin, "docker", "#!/bin/sh\nexit 127\n");
    chmodSync(join(bin, "docker"), 0o755);
    try {
      linkSync(process.execPath, join(bin, "bun")); // bun names its own folder by the path it was started from
    } catch {
      copyFileSync(
        process.execPath,
        join(bin, "bun"),
        constants.COPYFILE_FICLONE,
      );
      chmodSync(join(bin, "bun"), 0o755);
    }
    return { PATH: `${bin}:${process.env.PATH}` };
  };

  it("shows exactly that line when no product code changed", () => {
    const dir = repo();
    write(dir, "docs/notes.md", "hello\n");
    expect(stop(dir, {}, noDocker())).toEqual({ ...QUIET, told: HERE });
    expect(databaseChecksRan(dir)).toBe(0);
  });

  it("leads with that line before the verifier's ruling", () => {
    const env = noDocker();
    const dir = repo();
    start(dir);
    write(dir, "services/worker/src/route.ts", "const route = 1;\n");
    expect(stop(dir, {}, env).sentBack).toBe(true); // product code still needs the verifier
    verified(dir, "saw the route answer 200");
    expect(stop(dir, {}, env)).toEqual({
      ...QUIET,
      told: `${HERE} · verifier PASS: saw the route answer 200`,
    });

    const wait = repo();
    start(wait);
    write(wait, "services/worker/src/sms.ts", "const sms = 1;\n");
    verified(wait, "a real phone number to text", "CANNOT_VERIFY");
    const told = stop(wait, {}, env).told;
    expect(told).toBe(
      `${HERE} · NOT verified: the verifier needs something only you can provide: a real phone number to text`,
    );
    expect(told).not.toContain("✓");
  });

  it("finds Docker on the PATH the gate sets, so a hook started with a bare PATH still runs the database checks", () => {
    const dir = repo();
    write(dir, "docs/notes.md", "hello\n");
    // Claude Code may start a hook with a bare PATH; Docker then lives only in a folder scripts/done-gate.ts adds.
    const r = spawnSync(process.execPath, [GATE, "hook"], {
      cwd: dir,
      env: { ...process.env, PATH: "/usr/bin:/bin" },
      input: JSON.stringify({
        hook_event_name: "Stop",
        session_id: "s1",
        cwd: dir,
      }),
      encoding: "utf8",
    });
    expect(JSON.parse(r.stdout).systemMessage).toStartWith("Done gate ✓ ");
    expect(databaseChecksRan(dir)).toBe(3);
  });
});
