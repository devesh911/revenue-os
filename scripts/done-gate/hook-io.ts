// What a hook receives from Claude Code or Codex, and the line the gate shows Devesh.

export type HookInput = {
  hook_event_name?: string;
  session_id?: string;
  cwd?: string;
  agent_type?: string;
  agent_id?: string;
  tool_input?: Record<string, unknown>;
  background_tasks?: unknown[];
  session_crons?: unknown[];
};

export const say = (systemMessage: string) =>
  process.stdout.write(JSON.stringify({ systemMessage }));
