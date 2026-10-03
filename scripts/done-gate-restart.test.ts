// A session restarted mid-item: it is shown the branch's checkpoint (Devesh's request word for word, what is done,
// what failed, the exact next step), and a change it finds in its checkout that never passed the gate holds it at
// the done gate until that change passes. Each test drives the real hook and `gate checkpoint` command in a
// throwaway repository holding a copy of the gate, as Claude Code (or Codex) runs them; the checks' result is
// pre-seeded in the gate's record, so no suite runs here.
import { afterAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  removeTranscripts,
  sessionTranscript,
  verifierRun,
} from "./done-gate-verifier-run";

// A hook test starts bun and git a dozen times; with other agents busy on the machine that passes bun's 5 s.
setDefaultTimeout(60_000);
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  removeTranscripts();
});

const sh = (
  dir: string,
  cmd: string[],
  env: Record<string, string> = {},
  input?: string,
) =>
  spawnSync(cmd[0] as string, cmd.slice(1), {
    cwd: dir,
    env: { ...process.env, ...env },
    input,
    encoding: "utf8",
  });
const GIT = ["git", "-c", "user.email=t@t", "-c", "user.name=t"];
const write = (dir: string, file: string, body: string) => {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), body);
};
const commit = (dir: string) => {
  sh(dir, ["git", "add", "-A"]);
  sh(dir, [...GIT, "commit", "-qm", "x"]);
};

const ITEM = "Build the export button on the contacts page";
const BRANCH = "feat/export";

/**
 * A throwaway repository holding a copy of the gate and a ROADMAP.md on origin/main whose current slice holds ITEM,
 * checked out on BRANCH, which records ITEM as what it builds (AGENTS.md → The loop, step 2).
 */
function repo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "done-gate-restart-")));
  dirs.push(dir);
  mkdirSync(join(dir, "scripts"));
  copyFileSync(
    join(import.meta.dir, "done-gate.ts"),
    join(dir, "scripts", "done-gate.ts"),
  );
  cpSync(
    join(import.meta.dir, "done-gate"),
    join(dir, "scripts", "done-gate"),
    { recursive: true },
  );
  mkdirSync(join(dir, "docs", "tracker"), { recursive: true });
  copyFileSync(
    join(import.meta.dir, "..", "docs", "tracker", "parse.js"),
    join(dir, "docs", "tracker", "parse.js"),
  );
  write(dir, "STATE.md", "# State\n");
  write(
    dir,
    "ROADMAP.md",
    `## Slice 0: Ground\nStatus: in progress\nGoal: g\nProof: p\nBlocked by: nothing\nSeen by Devesh: —\n\n- [ ] ${ITEM} (agent)\n`,
  );
  sh(dir, ["git", "init", "-q", "-b", "main"]);
  commit(dir);
  sh(dir, ["git", "update-ref", "refs/remotes/origin/main", "HEAD"]);
  sh(dir, ["git", "checkout", "-qb", BRANCH]);
  sh(dir, ["git", "config", `branch.${BRANCH}.description`, ITEM]);
  return dir;
}

type Out = {
  decision?: string;
  reason?: string;
  systemMessage?: string;
  hookSpecificOutput?: {
    additionalContext?: string;
    permissionDecision?: string;
  };
};
/** The repository's own gate's hook, run as Claude Code (or Codex) runs it, from `cwd`. */
function hook(
  cwd: string,
  event: string,
  extra: Record<string, unknown> = {},
  codex = false,
) {
  const gate = join(
    sh(cwd, ["git", "rev-parse", "--show-toplevel"]).stdout.trim(),
    "scripts",
    "done-gate.ts",
  );
  const r = sh(
    cwd,
    ["bun", gate, "hook", ...(codex ? ["codex"] : [])],
    {},
    JSON.stringify({
      hook_event_name: event,
      session_id: "s1",
      cwd,
      ...extra,
    }),
  );
  const out = (r.stdout.trim() ? JSON.parse(r.stdout) : {}) as Out;
  return {
    out,
    shown: out.hookSpecificOutput?.additionalContext ?? "",
    told: out.systemMessage ?? "",
    sentBack: out.decision === "block" || r.status === 2,
    reason: out.reason ?? r.stderr,
  };
}
/** A session starting (or restarting) in `cwd`, with its own transcript. */
const start = (cwd: string, session: string, transcript?: string) =>
  hook(cwd, "SessionStart", {
    session_id: session,
    source: "startup",
    transcript_path: transcript ?? sessionTranscript(session),
  });
/** A shell command the session runs in `cwd`: the check before it runs first, as Claude Code runs it. */
const command = (
  cwd: string,
  session: string,
  line: string,
  transcript?: string,
) =>
  hook(cwd, "PreToolUse", {
    session_id: session,
    tool_name: "Bash",
    tool_input: { command: line },
    ...(transcript ? { transcript_path: transcript } : {}),
  });
/** An edit by the session: the check before it, then the file written. */
const edit = (cwd: string, session: string, file: string, body: string) => {
  hook(cwd, "PreToolUse", {
    session_id: session,
    tool_name: "Edit",
    tool_input: { file_path: join(cwd, file) },
  });
  write(cwd, file, body);
};
const stop = (cwd: string, session: string, codex = false) =>
  hook(cwd, "Stop", { session_id: session }, codex);
/** `bun run gate <args>` in `cwd`, as the agent types it after the check before the command let it through. */
function gate(cwd: string, session: string, ...args: string[]) {
  const quote = (a: string) => `'${a.replaceAll("'", `'\\''`)}'`;
  const line = `bun run gate ${args.map((a) => (a.startsWith("-") ? a : quote(a))).join(" ")}`;
  const check = command(cwd, session, line);
  expect(check.out.hookSpecificOutput?.permissionDecision).toBeUndefined();
  return sh(cwd, ["bun", "scripts/done-gate.ts", ...args]);
}
const checkpoint = (
  cwd: string,
  session: string,
  done: string,
  failed: string,
  next: string,
) =>
  gate(
    cwd,
    session,
    "checkpoint",
    "--done",
    done,
    "--failed",
    failed,
    "--next",
    next,
  );

// What the gate calls "this exact code": every non-ignored file, as a git tree id; its checks passed, as recorded.
function checksPassed(dir: string) {
  const common = sh(dir, [
    "git",
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]).stdout.trim();
  const index = join(common, `test-index-${process.pid}-${Date.now()}`);
  sh(dir, ["git", "add", "-A"], { GIT_INDEX_FILE: index });
  const tree = sh(dir, ["git", "write-tree"], {
    GIT_INDEX_FILE: index,
  }).stdout.trim();
  rmSync(index);
  write(common, `done-gate/checked/${tree}`, "typecheck, 3 tests");
}

// Transcript records as Claude Code writes them (trimmed to the fields the gate reads).
const typed = (text: string, at: string) => ({
  type: "user",
  origin: { kind: "human" },
  promptSource: "typed",
  timestamp: at,
  message: { role: "user", content: text },
});
const byScript = (text: string) => ({
  type: "user",
  promptSource: "sdk",
  message: { role: "user", content: text },
});

describe("the checkpoint: what a session restarted mid-item is shown", () => {
  const ASKED =
    "Add an export button to the contacts page.\nKeep the old CSV columns exactly as they are, in the same order.";

  it("shows a session restarted mid-item the item's checkpoint: Devesh's request word for word, what is done, what failed and the exact next step", () => {
    const dir = repo();
    const t1 = sessionTranscript("s1", [
      typed(ASKED, "2026-10-03T09:00:00Z"),
      byScript("a reminder a script sent, not Devesh's words"),
    ]);
    start(dir, "s1", t1);
    edit(dir, "s1", "services/worker/src/export.ts", "const exp = 1;\n");
    const saved = checkpoint(
      dir,
      "s1",
      "the button renders and downloads a file",
      "the CSV column test times out on the local database",
      "raise the CSV test's timeout in services/worker/test/export.test.ts, then run `bun run gate`",
    );
    expect(saved.stderr).toBe("");
    expect(saved.status).toBe(0);
    // s1 is cut off here (a crash, a closed laptop, a used-up context): it never reaches its stop.

    const shown = start(dir, "s2").shown;
    expect(shown).toContain(`Checkpoint of branch ${BRANCH}`);
    expect(shown).toContain(
      `--- typed by Devesh at 2026-10-03T09:00:00Z ---\n${ASKED}\n`,
    );
    expect(shown).not.toContain("a reminder a script sent");
    expect(shown).toContain("Done: the button renders and downloads a file");
    expect(shown).toContain(
      "Failed: the CSV column test times out on the local database",
    );
    expect(shown).toContain(
      "Next step: raise the CSV test's timeout in services/worker/test/export.test.ts, then run `bun run gate`",
    );
    expect(shown).toContain("bun run gate checkpoint --done");
    // The restarted agent can read it again whenever it likes.
    const read = gate(dir, "s2", "checkpoint");
    expect(read.status).toBe(0);
    expect(read.stdout).toContain(ASKED);
    expect(read.stdout).toContain("Next step: raise the CSV test's timeout");
    // It lives in the gate's record, which only the gate writes: a hand edit of it is refused.
    const common = sh(dir, [
      "git",
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ]).stdout.trim();
    expect(
      hook(dir, "PreToolUse", {
        session_id: "s2",
        tool_name: "Write",
        tool_input: {
          file_path: join(common, "done-gate", "checkpoint", "forged"),
          content: "{}",
        },
      }).out.hookSpecificOutput?.permissionDecision,
    ).toBe("deny");
  });

  it("keeps Devesh's earlier words when a later session, where he typed nothing, updates it; with nothing typed at all, the request is the branch's roadmap item, word for word", () => {
    const dir = repo();
    const t1 = sessionTranscript("s1", [typed(ASKED, "2026-10-03T09:00:00Z")]);
    start(dir, "s1", t1);
    checkpoint(dir, "s1", "nothing yet", "nothing", "write the button");
    const t2 = sessionTranscript("s2", [
      typed("Also add a button tooltip.", "2026-10-03T11:00:00Z"),
    ]);
    start(dir, "s2", t2);
    checkpoint(dir, "s2", "the button", "nothing", "the tooltip");
    start(dir, "s3"); // a restart where Devesh typed nothing
    checkpoint(dir, "s3", "the button and its tooltip", "nothing", "run it");
    const shown = start(dir, "s4").shown;
    expect(shown).toContain(ASKED);
    expect(shown).toContain("Also add a button tooltip.");
    expect(shown.indexOf(ASKED)).toBeLessThan(
      shown.indexOf("Also add a button tooltip."),
    ); // oldest first: the request, then what he added
    expect(shown).toContain("Done: the button and its tooltip");
    expect(shown).toContain("Next step: run it");

    const quiet = repo(); // a script started every session: Devesh typed nothing
    const t = sessionTranscript("s1", [byScript("Build the next item.")]);
    start(quiet, "s1", t);
    checkpoint(quiet, "s1", "nothing yet", "nothing", "write the button");
    const item = start(quiet, "s2").shown;
    expect(item).toContain(
      `Devesh typed nothing in the sessions that wrote this checkpoint, so the request is this branch's roadmap item, word for word:\n${ITEM}`,
    );
    expect(item).not.toContain("Build the next item.");
  });

  it("keeps one per checkout and branch, refuses one missing a part or too long, and reminds a branch building an item that has none yet", () => {
    const dir = repo();
    const reminder = start(dir, "s1").shown;
    expect(reminder).toContain(`No checkpoint of branch ${BRANCH} yet`);
    expect(reminder).toContain("bun run gate checkpoint --done");
    for (const args of [
      ["--done", "a", "--failed", "b"],
      ["--done", "a", "--failed", "b", "--next", ""],
      ["--done", "a", "--failed", "b", "--next", "c", "--next", "d"],
      ["--done", "a", "--failed", "b", "--next", "c", "--why", "e"],
      ["--done", "a".repeat(3_000), "--failed", "b", "--next", "c"],
    ]) {
      const r = gate(dir, "s1", "checkpoint", ...args);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain("bun run gate checkpoint --done");
    }
    expect(gate(dir, "s1", "checkpoint").stdout).toContain(
      `No checkpoint of branch ${BRANCH} yet`,
    );
    checkpoint(dir, "s1", "the button", "nothing", "the tooltip");

    // Another worktree on another branch has its own; this branch's is not shown there.
    const wt = join(
      realpathSync(mkdtempSync(join(tmpdir(), "done-gate-restart-wt-"))),
      "w",
    );
    dirs.push(dirname(wt));
    sh(dir, ["git", "worktree", "add", "-q", "-b", "feat/other", wt, "main"]);
    expect(start(wt, "s2").shown).not.toContain("the tooltip");
    expect(gate(wt, "s2", "checkpoint").stdout).toContain(
      "No checkpoint of branch feat/other yet",
    );
    // Switched to another branch, the checkout shows that branch's (none); back again, this one's.
    sh(dir, ["git", "checkout", "-q", "main"]);
    expect(start(dir, "s3").shown).toBe(""); // main records no item: nothing to remind
    sh(dir, ["git", "checkout", "-q", BRANCH]);
    expect(start(dir, "s4").shown).toContain("Next step: the tooltip");
  });
});

describe("work interrupted before it was checked", () => {
  it("holds the next session in that checkout at the done gate until the change passes", () => {
    const dir = repo();
    start(dir, "s1");
    edit(dir, "s1", "services/worker/src/export.ts", "const exp = 1;\n");
    // s1 is cut off before its stop: its change was never checked.

    const s2 = start(dir, "s2");
    expect(s2.told).toBe(
      "Done gate ⚠ this session is held to unchecked work: the main checkout (branch feat/export) holds a change that has not passed the gate (the checks have not passed); each of its stops judges that change until it passes",
    );
    expect(s2.shown).toContain(
      "This session is held to it: each of your stops judges that change",
    );
    // s2 changes nothing, yet its stop judges the change it found: the checks run (here they fail: no suite).
    const first = stop(dir, "s2");
    expect(first.sentBack).toBe(true);
    expect(first.told).toContain("Done gate ✗ sent the agent back (1/5)");
    // A compaction starts the session again: still held, and told so, without telling Devesh twice.
    const again = hook(dir, "SessionStart", {
      session_id: "s2",
      source: "compact",
      transcript_path: sessionTranscript("s2"),
    });
    expect(again.shown).toContain("This session is held to it");
    expect(again.told).toBe("");
    // The checks pass: product code still needs the verifier's own ruling.
    checksPassed(dir);
    expect(stop(dir, "s2").reason).toContain(
      'Run the verifier agent (Agent tool, subagent_type "verifier")',
    );
    expect(
      verifierRun(join(dir, "scripts", "done-gate.ts"), dir, {
        report: "Ruling: PASS — the export button downloads the old columns",
        session: "s2",
      }).stops.at(-1)?.status,
    ).toBe(0);
    expect(stop(dir, "s2")).toMatchObject({
      sentBack: false,
      told: "Done gate ✓ typecheck, 3 tests · verifier PASS: the export button downloads the old columns",
    });
    expect(stop(dir, "s2").told).toBe(""); // passed: the hold is over
    // The next session finds it proven: not held.
    expect(start(dir, "s3").told).toBe("");
    expect(stop(dir, "s3").told).toBe("");
  });

  it("holds a Codex session too, which stops once the checks pass, marked NOT independently verified (it has no verifier)", () => {
    const dir = repo();
    start(dir, "s1");
    edit(dir, "s1", "services/worker/src/export.ts", "const exp = 1;\n");
    const codex = hook(
      dir,
      "SessionStart",
      { session_id: "c1", source: "startup" },
      true,
    );
    expect(codex.told).toContain("this session is held to unchecked work");
    checksPassed(dir);
    expect(stop(dir, "c1", true).told).toContain(
      "NOT independently verified (Codex has no verifier agent)",
    );
    expect(stop(dir, "c1", true).told).toBe("");
  });

  it("does not hold a session whose checkout holds no change, or one that passed; on main, or in a checkout it only looks at, Devesh is told once instead", () => {
    const dir = repo();
    expect(start(dir, "s1").told).toBe(""); // a fresh branch: no change at all
    expect(stop(dir, "s1").told).toBe("");

    edit(dir, "s1", "docs/export.md", "How the export works.\n");
    checksPassed(dir);
    expect(stop(dir, "s1").told).toContain("no product code changed");
    expect(start(dir, "s2").told).toBe(""); // passed before s2 started
    expect(stop(dir, "s2").told).toBe("");

    // Devesh's own unchecked files in the main checkout, on main, never hold a session.
    const mine = repo();
    sh(mine, ["git", "checkout", "-q", "main"]);
    write(mine, "services/worker/src/mine.ts", "const mine = 1;\n");
    expect(start(mine, "s1").told).toBe("");
    expect(stop(mine, "s1")).toMatchObject({
      sentBack: false,
      told: "Done gate ⚠ this session changed nothing in the main checkout, but it holds product changes from before the session that nobody has verified",
    });
    expect(stop(mine, "s1").told).toBe("");

    // Interrupted work in a worktree the session only looks at: told once, not held.
    const builder = repo();
    sh(builder, ["git", "checkout", "-q", "main"]);
    const wt = join(
      realpathSync(mkdtempSync(join(tmpdir(), "done-gate-restart-wt-"))),
      "w",
    );
    dirs.push(dirname(wt));
    sh(builder, ["git", "worktree", "add", "-q", "-b", "feat/half", wt]);
    start(wt, "b1");
    edit(wt, "b1", "services/worker/src/half.ts", "const half = 1;\n");
    expect(start(builder, "r1").told).toBe(""); // the reviewer starts in the main checkout
    command(builder, "r1", `git -C ${wt} diff`);
    const looked = stop(builder, "r1");
    expect(looked.sentBack).toBe(false);
    expect(looked.told).toContain(
      "holds product changes from before the session that nobody has verified",
    );
  });
});
