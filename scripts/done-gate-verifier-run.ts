// For the done gate's tests: a verifier run as Claude Code reports it to the gate's hooks. The hook inputs, in
// order, and the transcript and meta files Claude Code writes side by side, keep the fields of real ones recorded on
// 2026-10-03 with Claude Code 2.1.287 (the pull request that added this file quotes them).

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type HookResult = {
  status: number | null;
  out: Record<string, unknown> & {
    hookSpecificOutput?: Record<string, string>;
    systemMessage?: string;
    decision?: string;
    reason?: string;
  };
  err: string;
};

/** The gate's hook run once, as Claude Code runs it: the input on stdin, started in the session's folder. */
export function runHook(
  gate: string,
  cwd: string,
  input: Record<string, unknown>,
  env: Record<string, string> = {},
): HookResult {
  const r = spawnSync("bun", [gate, "hook"], {
    cwd,
    env: { ...process.env, ...env },
    input: JSON.stringify({ session_id: "s1", cwd, ...input }),
    encoding: "utf8",
  });
  return {
    status: r.status,
    out: r.stdout.trim() ? JSON.parse(r.stdout) : {},
    err: r.stderr,
  };
}

/** A folder standing in for ~/.claude/projects/<project>, holding a session transcript made of `records`. */
export function sessionTranscript(session = "s1", records: object[] = []) {
  const dir = mkdtempSync(join(tmpdir(), "done-gate-projects-"));
  const path = join(dir, `${session}.jsonl`);
  writeFileSync(path, records.map((r) => `${JSON.stringify(r)}\n`).join(""));
  return path;
}

export type Run = {
  /** The report it delivers: its hand-back's message in auto mode, its last message otherwise. */
  report: string;
  /** auto: Claude Code gives it SubagentHandback (true by default). */
  auto?: boolean;
  session?: string;
  agent?: string;
  /** The model of each of its replies, as its transcript records them. */
  models?: string[];
  /** The `model` the Agent call passes, if any. */
  model?: string;
  /** Started by a workflow script, not the Agent tool: no Agent call, and no tool use id in its meta file. */
  byWorkflow?: boolean;
  /** The session transcript (sessionTranscript), when the test reads what the verifier is handed. */
  transcript?: string;
  /** The checkouts it runs a command in, whose code its ruling covers (the session's folder by default). */
  worksIn?: string[];
  /** What else happens while it works, before it stops. */
  during?: () => void;
};

/** A verifier started, working and delivering its report: what the gate's hook answered at each step. */
export function verifierRun(gate: string, cwd: string, run: Run) {
  const {
    report,
    auto = true,
    session = "s1",
    agent = `a${Math.random().toString(16).slice(2, 12)}`,
    models = ["claude-opus-5-5"],
  } = run;
  const transcript_path = run.transcript ?? sessionTranscript(session);
  const mode = auto ? "auto" : "default";
  const send = (input: Record<string, unknown>) =>
    runHook(gate, cwd, { session_id: session, transcript_path, ...input });
  const callId = `toolu_${agent}`;
  const call = run.byWorkflow
    ? undefined
    : send({
        hook_event_name: "PreToolUse",
        permission_mode: mode,
        tool_name: "Agent",
        tool_input: {
          description: "Verify the change",
          prompt: "Devesh's request, word for word: …",
          subagent_type: "verifier",
          ...(run.model ? { model: run.model } : {}),
        },
        tool_use_id: callId,
      });
  if (call?.out.hookSpecificOutput?.permissionDecision === "deny")
    return { call, stops: [] };
  const start = send({
    hook_event_name: "SubagentStart",
    agent_id: agent,
    agent_type: "verifier",
  });
  // Claude Code's own files for the agent, beside the session transcript.
  const own = join(
    transcript_path.replace(/\.jsonl$/, ""),
    "subagents",
    ...(run.byWorkflow ? ["workflows", "wf_test"] : []),
    `agent-${agent}.jsonl`,
  );
  mkdirSync(dirname(own), { recursive: true });
  writeFileSync(
    own.replace(/\.jsonl$/, ".meta.json"),
    JSON.stringify({
      agentType: "verifier",
      description: run.byWorkflow ? "verifier" : "Verify the change",
      ...(run.byWorkflow ? { workflowPhase: "Verify" } : { toolUseId: callId }),
      spawnDepth: 1,
      requestShape: "foreground",
      requestNonInteractive: true,
    }),
  );
  const reply = (model: string, content: object[]) =>
    appendFileSync(
      own,
      `${JSON.stringify({ type: "assistant", isSidechain: true, agentId: agent, message: { model, role: "assistant", content } })}\n`,
    );
  for (const model of models)
    reply(model, [{ type: "text", text: "I ran the checks." }]);
  for (const dir of run.worksIn ?? [cwd])
    send({
      hook_event_name: "PreToolUse",
      permission_mode: mode,
      agent_id: agent,
      agent_type: "verifier",
      tool_name: "Bash",
      tool_input: { command: `cd ${dir} && git status` },
      tool_use_id: `toolu_bash_${agent}`,
    });
  run.during?.();
  const stop = (extra: Record<string, unknown>) =>
    send({
      hook_event_name: "SubagentStop",
      permission_mode: mode,
      agent_id: agent,
      agent_type: "verifier",
      stop_hook_active: false,
      agent_transcript_path: own,
      background_tasks: [],
      session_crons: [],
      ...extra,
    });
  if (!auto)
    return { call, start, stops: [stop({ last_assistant_message: report })] };
  // Auto mode: it may stop once before handing back, and Claude Code sends it back to hand its report back.
  const early = stop({ last_assistant_message: report });
  const handBack = send({
    hook_event_name: "PreToolUse",
    permission_mode: mode,
    agent_id: agent,
    agent_type: "verifier",
    tool_name: "SubagentHandback",
    tool_input: { message: report },
    tool_use_id: `toolu_handback_${agent}`,
  });
  if (handBack.out.hookSpecificOutput?.permissionDecision === "deny")
    return { call, start, handBack, stops: [early] };
  reply(models.at(-1) ?? "", [
    { type: "tool_use", name: "SubagentHandback", input: { message: report } },
  ]);
  return {
    call,
    start,
    handBack,
    stops: [early, stop({ stop_hook_active: true })],
  };
}
