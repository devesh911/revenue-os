// A session restarted mid-item: it is shown the branch's checkpoint (Devesh's request word for word, what is done,
// what failed, the exact next step), and a change it finds in its worktree that never passed the gate holds it at
// the done gate until that change passes. Each test drives the real hook and `gate checkpoint` command in a
// throwaway repository holding a copy of the gate, as Claude Code (or Codex) runs them; the checks' result is
// pre-seeded in the gate's record, so no suite runs here. A session "cut off" long ago is one whose last sign of
// life (a hook event, a write to its transcript) the test moves back 16 minutes.
import { afterAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
const scratch = (name: string) => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), name)));
  dirs.push(d);
  return d;
};

const ITEM = "Build the export button on the contacts page";
const BRANCH = "feat/export";

/**
 * A throwaway repository holding a copy of the gate and a ROADMAP.md on origin/main whose current slice holds ITEM.
 * Its main checkout stays on main; `wt`, a worktree, is on BRANCH, which records ITEM as what it builds (AGENTS.md →
 * The loop, step 2), as an agent's worktree is.
 */
function repo() {
  const main = scratch("done-gate-restart-");
  mkdirSync(join(main, "scripts"));
  copyFileSync(
    join(import.meta.dir, "done-gate.ts"),
    join(main, "scripts", "done-gate.ts"),
  );
  cpSync(
    join(import.meta.dir, "done-gate"),
    join(main, "scripts", "done-gate"),
    { recursive: true },
  );
  mkdirSync(join(main, "docs", "tracker"), { recursive: true });
  copyFileSync(
    join(import.meta.dir, "..", "docs", "tracker", "parse.js"),
    join(main, "docs", "tracker", "parse.js"),
  );
  write(main, "STATE.md", "# State\n");
  write(
    main,
    "ROADMAP.md",
    `## Slice 0: Ground\nStatus: in progress\nGoal: g\nProof: p\nBlocked by: nothing\nProof passed: —\n\n- [ ] ${ITEM} (agent)\n`,
  );
  sh(main, ["git", "init", "-q", "-b", "main"]);
  commit(main);
  sh(main, ["git", "update-ref", "refs/remotes/origin/main", "HEAD"]);
  const wt = join(scratch("done-gate-restart-wt-"), "w");
  sh(main, ["git", "worktree", "add", "-q", "-b", BRANCH, wt, "main"]);
  sh(wt, ["git", "config", `branch.${BRANCH}.description`, ITEM]);
  return { main, wt };
}

type Out = {
  decision?: string;
  reason?: string;
  systemMessage?: string;
  hookSpecificOutput?: {
    additionalContext?: string;
    permissionDecision?: string;
    permissionDecisionReason?: string;
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
    refused: out.hookSpecificOutput?.permissionDecision === "deny",
    why: out.hookSpecificOutput?.permissionDecisionReason ?? "",
    sentBack: out.decision === "block" || r.status === 2,
    reason: out.reason ?? r.stderr,
  };
}
/** A session starting (or restarting) in `cwd`, with its own transcript. */
const start = (
  cwd: string,
  session: string,
  transcript?: string,
  source = "startup",
) =>
  hook(cwd, "SessionStart", {
    session_id: session,
    source,
    transcript_path: transcript ?? sessionTranscript(session),
  });
/** A shell command the session runs in `cwd`: the check before it runs first, as Claude Code runs it. */
const command = (cwd: string, session: string, line: string) =>
  hook(cwd, "PreToolUse", {
    session_id: session,
    tool_name: "Bash",
    tool_input: { command: line },
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
  let check = command(cwd, session, line);
  if (check.refused && check.why.includes("Checkpoint of"))
    check = command(cwd, session, line); // first sight of a checkpoint: shown, then run again
  expect(check.refused).toBe(false);
  return sh(cwd, ["bun", join(top(cwd), "scripts", "done-gate.ts"), ...args]);
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

const top = (dir: string) =>
  sh(dir, ["git", "rev-parse", "--show-toplevel"]).stdout.trim();
const record = (dir: string) =>
  join(
    sh(dir, [
      "git",
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ]).stdout.trim(),
    "done-gate",
  );

// What the gate calls "this exact code": every non-ignored file, as a git tree id; its checks passed, as recorded.
function checksPassed(dir: string) {
  const index = join(dirname(record(dir)), `test-index-${process.pid}`);
  sh(dir, ["git", "add", "-A"], { GIT_INDEX_FILE: index });
  const tree = sh(dir, ["git", "write-tree"], {
    GIT_INDEX_FILE: index,
  }).stdout.trim();
  rmSync(index);
  write(record(dir), `checked/${tree}`, "typecheck, 3 tests");
}

/** The sessions were cut off 16 minutes ago: when the gate last saw each at work, in each checkout, moves back. */
function cutOff(dir: string, ...sessions: string[]) {
  const ago = String(Date.now() - 16 * 60_000);
  const active = join(record(dir), "active");
  for (const s of sessions) {
    for (const f of existsSync(active) ? readdirSync(active) : [])
      if (f === s || f.startsWith(`${s}-`)) writeFileSync(join(active, f), ago);
    rmSync(join(record(dir), "stopping", s), { force: true });
  }
}

/** The verifier, started by `session`, rules PASS on the code in `cwd`. */
const verifierPasses = (cwd: string, session: string, note: string) =>
  expect(
    verifierRun(join(top(cwd), "scripts", "done-gate.ts"), cwd, {
      report: `Ruling: PASS — ${note}`,
      session,
    }).stops.at(-1)?.status,
  ).toBe(0);

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
    const { wt } = repo();
    const t1 = sessionTranscript("s1", [
      typed(ASKED, "2026-10-03T09:00:00Z"),
      byScript("a reminder a script sent, not Devesh's words"),
    ]);
    start(wt, "s1", t1);
    edit(wt, "s1", "services/worker/src/export.ts", "const exp = 1;\n");
    const saved = checkpoint(
      wt,
      "s1",
      "the button renders and downloads a file",
      "the CSV column test times out on the local database",
      "raise the CSV test's timeout in services/worker/test/export.test.ts, then run `bun run gate`",
    );
    expect(saved.stderr).toBe("");
    expect(saved.status).toBe(0);
    // s1 is cut off here (a crash, a closed laptop, a used-up context): it never reaches its stop.
    cutOff(wt, "s1");

    const shown = start(wt, "s2").shown;
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
    const read = gate(wt, "s2", "checkpoint");
    expect(read.status).toBe(0);
    expect(read.stdout).toContain(ASKED);
    expect(read.stdout).toContain("Next step: raise the CSV test's timeout");
    // It lives in the gate's record, which only the gate writes: a hand edit of it is refused.
    expect(
      hook(wt, "PreToolUse", {
        session_id: "s2",
        tool_name: "Write",
        tool_input: {
          file_path: join(record(wt), "checkpoint", "forged"),
          content: "{}",
        },
      }).refused,
    ).toBe(true);
  });

  it("keeps Devesh's earlier words when a later session, where he typed nothing, updates it; with nothing typed at all, the request is the branch's roadmap item, word for word", () => {
    const { wt } = repo();
    const t1 = sessionTranscript("s1", [typed(ASKED, "2026-10-03T09:00:00Z")]);
    start(wt, "s1", t1);
    checkpoint(wt, "s1", "nothing yet", "nothing", "write the button");
    const t2 = sessionTranscript("s2", [
      typed("Also add a button tooltip.", "2026-10-03T11:00:00Z"),
    ]);
    start(wt, "s2", t2);
    checkpoint(wt, "s2", "the button", "nothing", "the tooltip");
    start(wt, "s3"); // a restart where Devesh typed nothing
    checkpoint(wt, "s3", "the button and its tooltip", "nothing", "run it");
    const shown = start(wt, "s4").shown;
    expect(shown).toContain(ASKED);
    expect(shown).toContain("Also add a button tooltip.");
    expect(shown.indexOf(ASKED)).toBeLessThan(
      shown.indexOf("Also add a button tooltip."),
    ); // oldest first: the request, then what he added
    expect(shown).toContain("Done: the button and its tooltip");
    expect(shown).toContain("Next step: run it");

    const quiet = repo().wt; // a script started every session: Devesh typed nothing
    const t = sessionTranscript("s1", [byScript("Build the next item.")]);
    start(quiet, "s1", t);
    checkpoint(quiet, "s1", "nothing yet", "nothing", "write the button");
    const item = start(quiet, "s2").shown;
    expect(item).toContain(
      `Devesh typed nothing in the sessions that wrote this checkpoint, so the request is this branch's roadmap item, word for word:\n${ITEM}`,
    );
    expect(item).not.toContain("Build the next item.");
  });

  it("keeps one per checkout and branch (feat/x apart from feat_x), refuses one missing a part or too long, and reminds a branch building an item that has none yet", () => {
    const { main, wt } = repo();
    const reminder = start(wt, "s1").shown;
    expect(reminder).toContain(`No checkpoint of branch ${BRANCH} yet`);
    expect(reminder).toContain("bun run gate checkpoint --done");
    for (const args of [
      ["--done", "a", "--failed", "b"],
      ["--done", "a", "--failed", "b", "--next", ""],
      ["--done", "a", "--failed", "b", "--next", "c", "--next", "d"],
      ["--done", "a", "--failed", "b", "--next", "c", "--why", "e"],
      ["--done", "a".repeat(3_000), "--failed", "b", "--next", "c"],
    ]) {
      const r = gate(wt, "s1", "checkpoint", ...args);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain("bun run gate checkpoint --done");
    }
    expect(gate(wt, "s1", "checkpoint").stdout).toContain(
      `No checkpoint of branch ${BRANCH} yet`,
    );
    checkpoint(wt, "s1", "the button", "nothing", "the tooltip");

    // Another worktree on another branch has its own; this branch's is not shown there.
    const other = join(scratch("done-gate-restart-wt-"), "w");
    sh(main, ["git", "worktree", "add", "-q", "-b", "feat/other", other]);
    expect(start(other, "s2").shown).not.toContain("the tooltip");
    expect(gate(other, "s2", "checkpoint").stdout).toContain(
      "No checkpoint of branch feat/other yet",
    );
    // A branch whose name differs only by "_" for "/" has its own too.
    sh(wt, ["git", "checkout", "-q", "-b", "feat_export"]);
    expect(gate(wt, "s1", "checkpoint").stdout).toContain(
      "No checkpoint of branch feat_export yet",
    );
    // Switched to another branch, the checkout shows that branch's (none); back again, this one's.
    expect(start(wt, "s3").shown).toBe(""); // feat_export records no item: nothing to remind
    sh(wt, ["git", "checkout", "-q", BRANCH]);
    expect(start(wt, "s4").shown).toContain("Next step: the tooltip");
  });

  it("shows a request too long to show whole with his first message and his newest, within its limit", () => {
    const { wt } = repo();
    const t1 = sessionTranscript("s1", [
      ...Array.from({ length: 30 }, (_, i) =>
        typed(
          `message ${i}: ${"please keep the old columns ".repeat(10)}`,
          `2026-10-03T09:${String(i).padStart(2, "0")}:00Z`,
        ),
      ),
      typed("CORRECTION: use approach B, not A.", "2026-10-03T10:00:00Z"),
    ]);
    start(wt, "s1", t1);
    checkpoint(wt, "s1", "approach A", "nothing", "switch to approach B");
    const shown = start(wt, "s2").shown;
    expect(shown.length).toBeLessThanOrEqual(6_000);
    expect(shown).toContain("message 0:");
    expect(shown).toContain("CORRECTION: use approach B, not A.");
    expect(shown).toContain("Next step: switch to approach B");
    expect(shown).toContain("left out here");
  });

  it("shows a session that started elsewhere the checkpoint before its first command in that worktree, once; writing it there makes the change that session's to answer for", () => {
    const { main, wt } = repo();
    start(wt, "b1");
    edit(wt, "b1", "services/worker/src/export.ts", "const exp = 1;\n");
    checkpoint(wt, "b1", "the button", "nothing", "raise the timeout");
    cutOff(wt, "b1");

    // A builder restarted in the main checkout, as a workflow script starts one, that goes on in the worktree.
    const b2 = start(main, "b2");
    expect(b2.shown).not.toContain("raise the timeout");
    const first = command(main, "b2", `cd ${wt} && git status`);
    expect(first.refused).toBe(true);
    expect(first.why).toContain(`Checkpoint of branch ${BRANCH}`);
    expect(first.why).toContain("Next step: raise the timeout");
    expect(first.why).toContain("Run your command again");
    expect(first.told).toContain("showed the agent the checkpoint");
    expect(command(main, "b2", `cd ${wt} && git status`).refused).toBe(false);
    // Only looking, it is told once, as before.
    const looked = stop(main, "b2");
    expect(looked.sentBack).toBe(false);
    expect(looked.told).toContain(
      "holds product changes from before the session that nobody has verified",
    );
    // Writing the checkpoint there, it answers for that worktree's change: its stops judge it.
    checkpoint(wt, "b2", "read the code", "nothing", "run the verifier");
    expect(stop(main, "b2").sentBack).toBe(true);
  });

  it("sends a stop on a branch that builds an item back until the checkpoint describes the code as it stops", () => {
    const { main, wt } = repo();
    start(wt, "s1");
    edit(wt, "s1", "docs/export.md", "How the export works.\n");
    checksPassed(wt);
    const owed = stop(wt, "s1");
    expect(owed.sentBack).toBe(true);
    expect(owed.reason).toContain("bun run gate checkpoint --done");
    checkpoint(wt, "s1", "the export doc", "nothing", "the button");
    expect(stop(wt, "s1")).toMatchObject({
      sentBack: false,
      told: "Done gate ✓ typecheck, 3 tests (no product code changed, so no verifier needed)",
    });
    // Changed after it was written: it is out of date again.
    edit(wt, "s1", "docs/export.md", "How the export works, in full.\n");
    checksPassed(wt);
    expect(stop(wt, "s1").sentBack).toBe(true);
    checkpoint(wt, "s1", "the export doc, in full", "nothing", "the button");
    expect(stop(wt, "s1").sentBack).toBe(false);

    // A branch that records no item owes none.
    const plain = join(scratch("done-gate-restart-wt-"), "w");
    sh(main, ["git", "worktree", "add", "-q", "-b", "fix/typo", plain]);
    start(plain, "s2");
    edit(plain, "s2", "docs/typo.md", "A typo fixed.\n");
    checksPassed(plain);
    expect(stop(plain, "s2").sentBack).toBe(false);
  });
});

describe("work interrupted before it was checked", () => {
  it("holds the next session in that worktree at the done gate until the change passes", () => {
    const { wt } = repo();
    start(wt, "s1");
    edit(wt, "s1", "services/worker/src/export.ts", "const exp = 1;\n");
    cutOff(wt, "s1"); // before its stop: its change was never checked

    const s2 = start(wt, "s2");
    expect(s2.told).toContain(
      `Done gate ⚠ this session is held to unchecked work: ../`,
    );
    expect(s2.told).toContain(
      `(branch ${BRANCH}) holds a change that has not passed the gate (the checks have not passed); each of its stops judges that change until one passes on that branch`,
    );
    expect(s2.shown).toContain(
      "This session is held to it: each of your stops judges that change",
    );
    // s2 changes nothing, yet its stop judges the change it found: the checks run (here they fail: no suite).
    const first = stop(wt, "s2");
    expect(first.sentBack).toBe(true);
    expect(first.told).toContain("Done gate ✗ sent the agent back (1/5)");
    // A compaction starts the session again: still held, and told so, without telling Devesh twice.
    const again = start(wt, "s2", undefined, "compact");
    expect(again.shown).toContain("This session is held to it");
    expect(again.told).toBe("");
    // The checks pass: product code still needs the verifier's own ruling.
    checksPassed(wt);
    expect(stop(wt, "s2").reason).toContain(
      'Run the verifier agent (Agent tool, subagent_type "verifier")',
    );
    verifierPasses(wt, "s2", "the export button downloads the old columns");
    checkpoint(wt, "s2", "the export button", "nothing", "open the PR");
    expect(stop(wt, "s2")).toMatchObject({
      sentBack: false,
      told: "Done gate ✓ typecheck, 3 tests · verifier PASS: the export button downloads the old columns",
    });
    expect(stop(wt, "s2").told).toBe(""); // passed: the hold is over
    // The next session finds it proven: not held.
    expect(start(wt, "s3").told).toBe("");
    expect(stop(wt, "s3").told).toBe("");
  });

  it("holds a Codex session too, which stops once the checks pass, marked NOT independently verified (it has no verifier)", () => {
    const { wt } = repo();
    start(wt, "s1");
    edit(wt, "s1", "services/worker/src/export.ts", "const exp = 1;\n");
    cutOff(wt, "s1");
    const codex = hook(
      wt,
      "SessionStart",
      { session_id: "c1", source: "startup" },
      true,
    );
    expect(codex.told).toContain("this session is held to unchecked work");
    checksPassed(wt);
    checkpoint(
      wt,
      "c1",
      "the export button",
      "nothing",
      "ask Claude to verify",
    );
    expect(stop(wt, "c1", true).told).toContain(
      "NOT independently verified (Codex has no verifier agent)",
    );
    expect(stop(wt, "c1", true).told).toBe("");
  });

  it("holds nothing when the change passed or there is none; in the main checkout, on any branch, and in a worktree a session only looks at, Devesh is told once instead", () => {
    const { main, wt } = repo();
    expect(start(wt, "s1").told).toBe(""); // a fresh branch: no change at all
    expect(stop(wt, "s1").told).toBe("");

    edit(wt, "s1", "docs/export.md", "How the export works.\n");
    checksPassed(wt);
    checkpoint(wt, "s1", "the export doc", "nothing", "the button");
    expect(stop(wt, "s1").told).toContain("no product code changed");
    cutOff(wt, "s1");
    expect(start(wt, "s2").told).toBe(""); // passed before s2 started
    expect(stop(wt, "s2").told).toBe("");

    // Devesh's own files in the main checkout never hold a session, on main or on a feature branch.
    for (const branch of ["main", "feat/devesh"]) {
      const mine = repo().main;
      if (branch !== "main") sh(mine, ["git", "checkout", "-qb", branch]);
      write(mine, "notes/devesh-todo.txt", "call the plumber\n");
      write(mine, "services/worker/src/mine.ts", "const mine = 1;\n");
      expect(start(mine, "s1").told).toBe("");
      expect(stop(mine, "s1")).toMatchObject({
        sentBack: false,
        told: "Done gate ⚠ this session changed nothing in the main checkout, but it holds product changes from before the session that nobody has verified",
      });
      expect(stop(mine, "s1").told).toBe("");
    }

    // Interrupted work in a worktree a reviewer only looks at: told once, not held.
    const half = join(scratch("done-gate-restart-wt-"), "w");
    sh(main, ["git", "worktree", "add", "-q", "-b", "feat/half", half]);
    start(half, "b1");
    edit(half, "b1", "services/worker/src/half.ts", "const half = 1;\n");
    cutOff(half, "b1");
    expect(start(main, "r1").told).toBe(""); // the reviewer starts in the main checkout
    command(main, "r1", `git -C ${half} diff`);
    const looked = stop(main, "r1");
    expect(looked.sentBack).toBe(false);
    expect(looked.told).toContain(
      "holds product changes from before the session that nobody has verified",
    );
  });

  it("holds no one while the session that made the change is still at work (a second session, a teammate, one in a long stop), and holds once it has been quiet 15 minutes", () => {
    const { wt } = repo();
    start(wt, "lead");
    edit(wt, "lead", "services/worker/src/export.ts", "const exp = 1;\n");

    // Devesh opens a second session in the worktree to ask a question while the lead works.
    const q = start(wt, "q");
    expect(q.told).toBe("");
    expect(q.shown).toContain("still at work");
    command(wt, "q", "cat ROADMAP.md");
    const asked = stop(wt, "q");
    expect(asked.sentBack).toBe(false);
    expect(asked.told).toContain("nobody has verified");
    // A teammate started in the lead's worktree.
    start(wt, "mate");
    command(wt, "mate", "cat ROADMAP.md");
    expect(hook(wt, "TeammateIdle", { session_id: "mate" }).sentBack).toBe(
      false,
    );
    // The question session asks something more; the lead's own stop runs its checks for a long time: still at work.
    command(wt, "q", "git log --oneline");
    cutOff(wt, "lead");
    write(record(wt), "stopping/lead", `${process.pid} ${Date.now()}`);
    expect(stop(wt, "q").sentBack).toBe(false);

    // The lead is cut off: the question session's next stop judges its change.
    cutOff(wt, "lead");
    const held = stop(wt, "q");
    expect(held.sentBack).toBe(true);
    expect(held.reason).toContain("held to");
    // Asking Devesh lets it stop, and ends the hold: he decides what happens to the change.
    expect(
      gate(wt, "q", "pause", "Is the export the lead's to finish?").status,
    ).toBe(0);
    expect(stop(wt, "q")).toMatchObject({
      sentBack: false,
      told: "Done gate ⏸ waiting on you: Is the export the lead's to finish? (the change so far is NOT verified)",
    });
    expect(stop(wt, "q")).toMatchObject({ sentBack: false, told: "" });
  });

  it("counts a session as at work only in a checkout it is still working in: one that looked at the worktree, then went on elsewhere, does not keep the hold off", () => {
    const { main, wt } = repo();
    start(wt, "b1");
    start(main, "coord");
    command(main, "coord", `git -C ${wt} status`); // a coordinator looks in, before the builder's change
    edit(wt, "b1", "services/worker/src/export.ts", "const exp = 1;\n");
    cutOff(wt, "b1", "coord");
    command(main, "coord", "git status"); // and goes on working in the main checkout
    expect(start(wt, "b2").told).toContain("held to unchecked work");
  });

  it("keeps the hold when the session switches away and back: only a pass on the held branch ends it", () => {
    const { wt } = repo();
    start(wt, "s1");
    edit(wt, "s1", "services/worker/src/export.ts", "const exp = 1;\n");
    command(wt, "s1", "git commit -am export");
    commit(wt);
    cutOff(wt, "s1");
    expect(start(wt, "s2").told).toContain("held to unchecked work");

    // A branch at main's code, which already passed.
    command(wt, "s2", "git checkout -q -b feat/side main");
    sh(wt, ["git", "checkout", "-q", "-b", "feat/side", "main"]);
    checksPassed(wt);
    const away = stop(wt, "s2");
    expect(away.sentBack).toBe(true);
    expect(away.reason).toContain(`git checkout ${BRANCH}`);

    command(wt, "s2", `git checkout -q ${BRANCH}`);
    sh(wt, ["git", "checkout", "-q", BRANCH]);
    const back = stop(wt, "s2");
    expect(back.sentBack).toBe(true); // judged: its checks fail here
    expect(back.reason).not.toContain(`git checkout ${BRANCH}`);
  });

  it("holds a session resumed after a held session touched its worktree", () => {
    const { wt } = repo();
    const t1 = sessionTranscript("s1");
    start(wt, "s1", t1);
    edit(wt, "s1", "services/worker/src/export.ts", "const exp = 1;\n");
    cutOff(wt, "s1");
    expect(start(wt, "s2").told).toContain("held to unchecked work");
    // s2 is cut off at once; s1 is resumed (`claude --resume`, the same session).
    const resumed = start(wt, "s1", t1, "resume");
    expect(resumed.told).toContain("held to unchecked work");
    command(wt, "s1", "git status");
    expect(stop(wt, "s1").sentBack).toBe(true);
  });

  it("decides the hold at session start from the gate's record alone: no rule or check runs there, so a big branch can't run the start past its 30 seconds", () => {
    const { wt } = repo();
    start(wt, "s1");
    edit(wt, "s1", "scripts/tool.ts", "// @ts-ignore\nexport const x = 1;\n");
    cutOff(wt, "s1");
    const s2 = start(wt, "s2");
    expect(s2.told).toContain("(the checks have not passed)");
    expect(s2.told).not.toContain("rule problem");
    // Its stop runs the rules.
    expect(stop(wt, "s2").reason).toContain("switches the type checker off");
  });
});
