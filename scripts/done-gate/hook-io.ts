// What a hook receives from Claude Code or Codex, and the line the gate shows Devesh.

import { homedir } from "node:os";
import { resolve } from "node:path";

export type HookInput = {
  hook_event_name?: string;
  session_id?: string;
  cwd?: string;
  agent_type?: string;
  agent_id?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  background_tasks?: unknown[];
  session_crons?: unknown[];
};

/** The input with `cwd` set to the folder its command runs in: Claude Code's terminal tool may name its own. */
export const runsIn = (input: HookInput): HookInput => {
  const dir = input.tool_input?.cwd;
  return typeof dir === "string"
    ? {
        ...input,
        cwd: resolve(
          input.cwd ?? process.cwd(),
          dir.replace(/^~(?=\/|$)/, homedir()),
        ),
      }
    : input;
};

export const say = (systemMessage: string) =>
  process.stdout.write(JSON.stringify({ systemMessage }));
