// The proved checkout's done gate, driven in a scratch copy the way agents' tools and CI drive it: its hook before a
// command and at a stop, as Claude Code runs it; main's copy of the pull request check, as rules-from-main runs it;
// a stand-in `gh` for its merge check; and its record of checks that passed, as a passing `bun run gate` leaves it.

import { spawnSync } from "node:child_process";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { snapshot } from "../done-gate/snapshot";
import { Store, stateDir } from "../done-gate/store";
import { plainEnv, sh, write } from "./scratch";

export type Told = {
  refused: boolean; // a command or edit refused before it ran
  sentBack: boolean; // a stop sent back to work
  why: string; // what the agent is told
  told: string; // what Devesh is told
  context: string; // what a session is shown when it starts
};

/**
 * The gate's hook in `dir`, as Claude Code runs it for `event`: the input on stdin, for session `o.session`, started
 * with `o.bun` and the PATH and home folder only (plus `o.env`).
 */
export function hook(
  dir: string,
  event: string,
  input: Record<string, unknown> = {},
  o: { env?: Record<string, string>; session?: string; bun?: string } = {},
): Told {
  const r = spawnSync(
    o.bun ?? "bun",
    [join(dir, "scripts", "done-gate.ts"), "hook"],
    {
      cwd: dir,
      env: plainEnv(o.env),
      input: JSON.stringify({
        hook_event_name: event,
        session_id: o.session ?? "proof-1",
        cwd: dir,
        ...input,
      }),
      encoding: "utf8",
    },
  );
  let out: {
    decision?: string;
    reason?: string;
    systemMessage?: string;
    hookSpecificOutput?: Record<string, string>;
  } = {};
  try {
    out = r.stdout?.trim() ? JSON.parse(r.stdout) : {};
  } catch {
    out = { systemMessage: r.stdout };
  }
  return {
    refused: out.hookSpecificOutput?.permissionDecision === "deny",
    sentBack: out.decision === "block" || r.status === 2,
    why:
      out.hookSpecificOutput?.permissionDecisionReason ??
      out.reason ??
      r.stderr ??
      "",
    told: out.systemMessage ?? "",
    context: out.hookSpecificOutput?.additionalContext ?? "",
  };
}

/** A shell command, as an agent's Bash tool hands it to the hook. */
export const bash = (command: string) => ({
  tool_name: "Bash",
  tool_input: { command },
});

/** What a refusal says, in one line for the report. */
export const said = (t: Told) =>
  (t.told || t.why || "(nothing)").split("\n")[0] ?? "";

/**
 * Main's copy of the pull request check (`bun scripts/done-gate.ts pr`), run from `dir` with main checked out, on
 * `head` as data, with `body` as the pull request's body and 9999 as its number.
 */
export const judged = (dir: string, body: string, head = "feat") =>
  sh(
    dir,
    ["bun", "scripts/done-gate.ts", "pr", "--base", "main", "--head", head],
    {
      PR_BODY: body,
      PR_NUMBER: PR,
    },
  );
export const PR = "9999";

/** The done rules alone on `head`, as CI's `bun run gate rules` and every stop run them. */
export const rules = (dir: string, head = "feat") =>
  sh(dir, [
    "bun",
    "scripts/done-gate.ts",
    "rules",
    "--base",
    "main",
    "--head",
    head,
  ]);

/** Records that every check passed on `dir`'s code as it is (`partial`: all but the database ones, as without Docker). */
export function checksPassed(dir: string, kind = "checked") {
  new Store(stateDir(dir)).put(
    kind,
    snapshot(dir, false).tree,
    "typecheck, lint, guards, tests (recorded as passed by the proof)",
  );
}

/** A stand-in `gh` whose `gh pr view` names `head` and whose `gh api` finds no check runs; the PATH that finds it. */
export function standInGh(base: string, head: string) {
  const bin = join(base, "gh-bin");
  write(
    bin,
    "gh",
    `#!/bin/sh\ncase "$1" in\n  pr) echo ${head} ;;\n  api) echo '{"total_count":0,"check_runs":[]}' ;;\nesac\n`,
  );
  chmodSync(join(bin, "gh"), 0o755);
  return { PATH: `${bin}:${process.env.PATH}` };
}
