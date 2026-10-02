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
// it names the pull request's head commit (`--match-head-commit`) and that commit was proven here, so work
// committed, pushed and merged in one go is checked too; any other way of merging is refused before it runs.
// Proven means (1) the change against main breaks none of the done rules (done-gate/rules.ts), (2) every check
// is green on this exact code, and (3) if product code changed, the verifier agent (and only it) ruled PASS on
// this exact code; at a stop, a CANNOT_VERIFY naming what only Devesh can provide also lets the agent stop, told
// to him as NOT verified, and then only Devesh merges. Codex has no verifier agent, so its green product change stops once,
// marked NOT independently verified. Results are kept per code state in .git/done-gate, so the same code is
// never checked twice.
//
// The code lives in scripts/done-gate/, one job per file (docs/patterns/one-job-per-file.md). This file stays the
// entry the hooks and `bun run gate` call: it hands a hook event to hook.ts and a command to cli.ts. It loads them
// only inside its error handling, so a file there that fails to load (a renamed export, a missing file) is told to
// Devesh and refuses a merge, never skipping a check in silence.

import { dirname } from "node:path";
import type { HookInput } from "./done-gate/hook-io";

// Hooks can start with a bare PATH; bun, gh, supabase, psql and docker live in these.
process.env.PATH = [
  dirname(process.execPath),
  process.env.PATH,
  "/opt/homebrew/bin",
  "/usr/local/bin",
].join(":");

const say = (systemMessage: string) =>
  process.stdout.write(JSON.stringify({ systemMessage }));

/** Before a tool call, with the gate's code unloadable: refuse anything that may merge, and say so for the rest. */
function unloaded(input: HookInput, why: string) {
  const command =
    typeof input.tool_input?.command === "string"
      ? input.tool_input.command
      : "";
  // Nothing here can read the command, so any that names merge with its quotes and backslashes taken out may merge.
  if (!/merge/i.test(command.replace(/['"\\]/g, "")))
    return say(
      `Done gate ⚠ could not load (${why}): nothing done here is checked until it loads`,
    );
  const reason = `it could not load the done gate (${why}), so it can't check this merge. Fix the gate first.`;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `The done gate refused this merge: ${reason}`,
      },
      systemMessage: `Done gate ✗ merge refused: ${reason}`,
    }),
  );
}

if (import.meta.main) {
  const [cmd = "check", ...args] = process.argv.slice(2);
  if (cmd === "hook") {
    let input: HookInput = {};
    let loaded = false;
    try {
      input = JSON.parse((await Bun.stdin.text()) || "{}") as HookInput;
      const { hook } = await import("./done-gate/hook");
      loaded = true;
      await hook(input, args[0] === "codex", import.meta.path);
    } catch (e) {
      const why = String(e).split("\n")[0] ?? "";
      // Only a stop is a check; a failure to note a checkout before a tool call stays quiet, once the gate loaded.
      if (input.hook_event_name !== "PreToolUse")
        say(`Done gate ⚠ could not run (${why}); this stop was NOT checked`);
      else if (!loaded) unloaded(input, why);
    }
    process.exit(0);
  }
  const { cli } = await import("./done-gate/cli");
  await cli(cmd, args);
}
