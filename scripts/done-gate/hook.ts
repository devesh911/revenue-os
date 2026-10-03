// A hook event from Claude Code or Codex, handed to the file that handles it: before a tool call an MCP tool that
// merges, the gate's own record and hook, what agents' tools may not do, the merge check and the note of the
// checkout, the verifier's start and stop, and the judgement at a stop.

import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { toplevel, touch } from "./checkouts";
import { type HookInput, runsIn } from "./hook-io";
import { deny, mergeGate } from "./merge-gate";
import { mergeToolRefusal } from "./merge-reading";
import { recordRefusal } from "./record-guard";
import { stop } from "./stop";
import { Store, stateDir } from "./store";
import { commandRefusal } from "./tools";
import { verifierDone } from "./verifier";

/**
 * `entry`: the scripts/done-gate.ts that loaded this file. `codex`: run by .codex/hooks.json (`hook codex`) rather
 * than Claude Code's .claude/settings.json.
 */
export async function hook(input: HookInput, codex: boolean, entry: string) {
  const event = input.hook_event_name;
  let command = input; // before a tool call, with the folder its command runs in
  // Before a tool call, what agents' tools may not do is judged first, so nothing that fails before it lets a
  // command through; a check that fails refuses the command.
  if (event === "PreToolUse") {
    const tool = mergeToolRefusal(input.tool_name);
    if (tool) return deny(tool);
    let refused: string | undefined;
    try {
      command = runsIn(input);
      refused = recordRefusal(command) ?? commandRefusal(command);
    } catch (e) {
      refused = `it could not check this command (${String(e).split("\n")[0]}).`;
    }
    if (refused)
      return deny(
        refused,
        /^(Edit|Write|MultiEdit|NotebookEdit|apply_patch)$/.test(
          input.tool_name ?? "",
        )
          ? "edit"
          : "command",
      );
  }
  // The gate of the checkout the agent is in; when that has none (a branch cut before the gate, another
  // repository, no checkout at all), the one this file belongs to, whose repository holds the session's record.
  const shell = toplevel(input.cwd ?? process.cwd());
  const repo =
    shell && existsSync(join(shell, "scripts", "done-gate.ts"))
      ? shell
      : toplevel(dirname(entry));
  if (!repo) return;
  const own = join(repo, "scripts", "done-gate.ts");
  if (event !== "PreToolUse" && realpathSync(own) !== realpathSync(entry)) {
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
        mergeGate(repo, command, store, codex);
      } catch (e) {
        deny(`it could not check this merge (${String(e).split("\n")[0]}).`);
      }
      return touch(repo, command, store, session); // a failure here stays quiet: no tool call waits on it
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
