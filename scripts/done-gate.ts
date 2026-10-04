// The done gate: an agent may not stop while its change is unproven. Claude Code and Codex run it from
// their hooks (.claude/settings.json, .codex/hooks.json); CI runs its rules on every pull request; a human
// runs `bun run gate`.
//
//   bun run gate                                  the done rules + every check, on the code as it stands
//   bun run gate rules [--base <ref>]             only the rules, on the change since HEAD left <ref> (origin/main)
//   bun run gate tests [e2e]                      bun's tests (or the browser checks); fails if any test didn't run
//   bun run gate pause "<question>"               the next stop asks Devesh something; it is not "done"
//   bun run see /o/:org/contacts [more paths]     sign in as the dev login; save what each page shows
//
// Two moments are checked. A stop: the session's change, in each checkout it worked in and was the last to work
// in (a hook before each command or edit notes them, and the state it found each in), must be proven; a checkout
// it only looked at, or moved only to commits origin/main holds (a pull, a switch to main), is not its change, but
// one whose latest commit main does not hold is, however it got there (done-gate/only-main.ts). Without Docker,
// or while background work runs, the checks on the database don't run at a stop, and Devesh is told so in place of
// a ✓ (done-gate/not-run.ts). A merge: an agent's `gh pr merge` goes through only when
// it names the pull request's head commit (`--match-head-commit`) and that commit was proven here, so work
// committed, pushed and merged in one go is checked too; any other way of merging is refused before it runs.
// Proven means (1) the change against main breaks none of the done rules (done-gate/rules.ts), (2) every check
// is green on this exact code, and (3) if product code changed, the verifier agent ruled PASS on this exact code
// in its own delivered report (done-gate/verifier.ts); at a stop, a CANNOT_VERIFY naming what only Devesh can provide also lets the agent stop, told
// to him as NOT verified, and then only Devesh merges. Codex has no verifier agent, so its green product change stops once,
// marked NOT independently verified. Results are kept per code state in .git/done-gate, so the same code is
// never checked twice.
//
// The code lives in scripts/done-gate/, one job per file (docs/patterns/one-job-per-file.md). This file stays the
// entry the hooks and `bun run gate` call: it hands a hook event to hook.ts and a command to cli.ts. It loads them
// only inside its error handling, so a file there that fails to load (a renamed export, a missing file) is told to
// Devesh and refuses a merge, or a touch of the gate's record or hook, never skipping a check in silence.

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

// While the gate can't load: a git folder (`.git`, or git's ways of naming one), the record's name outside the gate's
// code, or a run of its hook by hand (`done-gate.ts … hook`, `gate hook`).
const GUARDED =
  /(^|[^\w.-])\.git([^\w-]|$)|--(git-common-dir|git-dir|absolute-git-dir|git-path)\b|\bGIT_(COMMON_)?DIR\b|(?<!scripts\/)done-gate(?![\w.-])|done-gate\.ts\b[\s\S]*\bhook\b|\bgates?\s+(--\s+)?hook\b/;

/**
 * Before a tool call, with the gate's code unloadable. Nothing here can read a command, so its text (quotes and
 * backslashes taken out), an edit's path and an MCP tool's name are judged whole: refused is anything that names
 * merge, the git folder, the record or a run of its hook, and any command run inside a git folder; the rest goes
 * through, told that nothing is checked until the gate loads.
 */
function unloaded(input: HookInput, why: string) {
  const tool = input.tool_input ?? {};
  const text = [
    tool.command,
    tool.file_path,
    tool.notebook_path,
    input.tool_name?.startsWith("mcp__") && input.tool_name,
  ]
    .filter((t) => typeof t === "string")
    .join("\n")
    .replace(/['"\\]/g, "");
  const what = /merge/i.test(text)
    ? "merge"
    : GUARDED.test(text) || /(^|\/)\.git(\/|$)/.test(input.cwd ?? "")
      ? /^(Edit|Write|MultiEdit|NotebookEdit|apply_patch)$/.test(
          input.tool_name ?? "",
        )
        ? "edit"
        : "command"
      : undefined;
  if (!what)
    return say(
      `Done gate ⚠ could not load (${why}): nothing done here is checked until it loads`,
    );
  const reason = `it could not load the done gate (${why}), so it can't check this ${what}${what === "merge" ? "" : ", which names the git folder, the gate's record or its hook"}. Fix the gate first.`;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `The done gate refused this ${what}: ${reason}`,
      },
      systemMessage: `Done gate ✗ ${what} refused: ${reason}`,
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
