// The done gate: an agent may not stop while its change is unproven. Claude Code and Codex run it from
// their hooks (.claude/settings.json, .codex/hooks.json); CI runs its rules on every pull request; a human
// runs `bun run gate`.
//
//   bun run gate                                  the done rules + every check, on the code as it stands
//   bun run gate rules [--base <ref>]             only the rules, on the change since HEAD left <ref> (origin/main)
//   bun run gate tests [e2e]                      bun's tests (or the browser checks); fails if any test didn't run
//   bun run gate pause "<question>"               the next stop asks Devesh something; it is not "done"
//   bun run gate verdict pass|fail "<what you saw>"   the verifier agent's ruling, or
//   bun run gate verdict cannot-verify "<what only Devesh can provide>"
//   bun run see /o/:org/contacts [more paths]     sign in as the dev login; save what each page shows
//
// Two moments are checked. A stop: the session's change, in each checkout it worked in and was the last to work
// in (a hook before each command or edit notes them, and the state it found each in), must be proven; a checkout
// it only looked at, switched or pulled is not its change. A merge: an agent's `gh pr merge` goes through only when
// the pull request's head commit was proven here, so work committed, pushed and merged in one go is checked too.
// Proven means (1) the change against main breaks none of the done rules (done-gate/rules.ts), (2) every check
// is green on this exact code, and (3) if product code changed, the verifier agent (and only it) ruled PASS on
// this exact code; at a stop, a CANNOT_VERIFY naming what only Devesh can provide also lets the agent stop, told
// to him as NOT verified, and then only Devesh merges. Codex has no verifier agent, so its green product change stops once,
// marked NOT independently verified. Results are kept per code state in .git/done-gate, so the same code is
// never checked twice.
//
// The code lives in scripts/done-gate/, one job per file (docs/patterns/one-job-per-file.md). This file stays the
// entry the hooks and `bun run gate` call: it hands a hook event to the file that handles it, and a command to
// cli.ts.

import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { toplevel, touch } from "./done-gate/checkouts";
import { cli } from "./done-gate/cli";
import { type HookInput, say } from "./done-gate/hook-io";
import { deny, mergeGate } from "./done-gate/merge-gate";
import { stop } from "./done-gate/stop";
import { Store, stateDir } from "./done-gate/store";
import { verifierDone } from "./done-gate/verifier";

export { parseDiff } from "./done-gate/diff";
export { usesExport } from "./done-gate/export-users";
export { mergeOf } from "./done-gate/merge-gate";
export { checkRules, RULE_FILES } from "./done-gate/rules";
export { onSharedStack } from "./done-gate/shared-stack";
export { simpleCommands } from "./done-gate/shell-words";
export { notRun } from "./done-gate/tests-ran";

// Hooks can start with a bare PATH; bun, gh, supabase, psql and docker live in these.
process.env.PATH = [
  dirname(process.execPath),
  process.env.PATH,
  "/opt/homebrew/bin",
  "/usr/local/bin",
].join(":");

/** `codex`: run by .codex/hooks.json (`hook codex`) rather than Claude Code's .claude/settings.json. */
async function hook(input: HookInput, codex: boolean) {
  const event = input.hook_event_name;
  // The gate of the checkout the agent is in; when that has none (a branch cut before the gate, another
  // repository, no checkout at all), the one this file belongs to, whose repository holds the session's record.
  const shell = toplevel(input.cwd ?? process.cwd());
  const repo =
    shell && existsSync(join(shell, "scripts", "done-gate.ts"))
      ? shell
      : toplevel(import.meta.dir);
  if (!repo) return;
  const own = join(repo, "scripts", "done-gate.ts");
  if (
    event !== "PreToolUse" &&
    realpathSync(own) !== realpathSync(import.meta.path)
  ) {
    // Hooks load this file from the project root; always judge with the gate that belongs to the code.
    const r = spawnSync(
      process.execPath,
      [own, "hook", ...(codex ? ["codex"] : [])],
      {
        input: JSON.stringify(input),
        stdio: ["pipe", "inherit", "inherit"],
      },
    );
    process.exit(r.status ?? 0);
  }
  const store = new Store(stateDir(repo));
  const session = input.session_id ?? "unknown";
  switch (event) {
    case "SessionStart":
      return touch(repo, input, store, session);
    case "PreToolUse":
      try {
        mergeGate(repo, input, store, codex);
      } catch (e) {
        deny(`it could not check this merge (${String(e).split("\n")[0]}).`);
      }
      return touch(repo, input, store, session); // a failure here stays quiet: no tool call waits on it
    case "SubagentStart": // a fresh verifier: only rulings recorded from now on are its own
      if (input.agent_type === "verifier")
        store.put(
          "verifier",
          `${session}-${input.agent_id ?? "main"}`,
          String(Date.now()),
        );
      return;
    case "SubagentStop":
      if (input.agent_type === "verifier")
        verifierDone(repo, input, store, session);
      return;
    case "Stop":
    case "TeammateIdle":
      return stop(input, repo, store, session, codex);
  }
}

if (import.meta.main) {
  const [cmd = "check", ...args] = process.argv.slice(2);
  if (cmd === "hook") {
    let input: HookInput = {};
    try {
      input = JSON.parse((await Bun.stdin.text()) || "{}") as HookInput;
      await hook(input, args[0] === "codex");
    } catch (e) {
      // Only a stop is a check; a failure to note a checkout before a tool call stays quiet.
      if (input.hook_event_name !== "PreToolUse")
        say(
          `Done gate ⚠ could not run (${String(e).split("\n")[0]}); this stop was NOT checked`,
        );
    }
    process.exit(0);
  }
  await cli(cmd, args);
}
