// A scripted Claude Code session for a proof step: `claude -p` in a scratch clone, whose only credential is the
// proof's own Anthropic key (ANTHROPIC_EVALS_KEY, handed on as ANTHROPIC_API_KEY). It gets no GitHub token, no other
// key and a home folder of its own, so it never uses Devesh's login or settings, and it loads only the project's
// settings, so the clone's hooks (the banner, the done gate) run as in any session. Edits are allowed and nothing
// else is unless `tools` names it; nothing ever asks. Each exchange is added to the transcript: readable (.txt) and
// as Claude Code's own events (.jsonl).

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { plainEnv } from "./scratch";

export type Session = {
  dir: string; // the scratch clone it works in
  key: string; // ANTHROPIC_EVALS_KEY
  path?: string; // the PATH that finds claude, bun and git
  home: string; // a folder of its own
  transcript: string; // the readable transcript
  events: string; // Claude Code's events, one JSON object per line
  tools: string; // the tools it may use beyond reading and editing, as --allowedTools takes them
  args?: string[]; // more of claude's options, such as --agent verifier
  dollars: number; // the most one exchange may spend
};

type Event = {
  type?: string;
  session_id?: string;
  result?: string;
  is_error?: boolean;
  message?: { content?: { type: string; name?: string; input?: unknown }[] };
};

/** A conversation: each call sends one prompt (resuming the conversation after the first) and returns the reply. */
export function conversation(s: Session) {
  let id: string | undefined;
  mkdirSync(join(s.home, ".claude"), { recursive: true });
  return (prompt: string) => {
    const r = spawnSync(
      "claude",
      [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--setting-sources",
        "project",
        "--permission-mode",
        "acceptEdits",
        "--permission-prompts",
        "none",
        "--allowedTools", // takes several values: an option of one value must follow it, never the prompt
        s.tools,
        "--max-budget-usd",
        String(s.dollars),
        ...(s.args ?? []),
        ...(id ? ["--resume", id] : []),
        prompt,
      ],
      {
        cwd: s.dir,
        env: plainEnv({
          PATH: s.path,
          HOME: s.home,
          CLAUDE_CONFIG_DIR: join(s.home, ".claude"),
          ANTHROPIC_API_KEY: s.key,
        }),
        encoding: "utf8",
        timeout: 20 * 60_000,
        maxBuffer: 256 << 20,
      },
    );
    appendFileSync(s.events, r.stdout ?? "");
    const events = (r.stdout ?? "").split("\n").flatMap((l): Event[] => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    });
    const result = events.filter((e) => e.type === "result").at(-1);
    id ??= result?.session_id ?? events.find((e) => e.session_id)?.session_id;
    const used = events.flatMap((e) =>
      e.type === "assistant"
        ? (e.message?.content ?? [])
            .filter((c) => c.type === "tool_use")
            .map((c) => `${c.name} ${JSON.stringify(c.input).slice(0, 200)}`)
        : [],
    );
    const reply = String(result?.result ?? "");
    appendFileSync(
      s.transcript,
      `Devesh: ${prompt}\n${used.map((u) => `  (tool) ${u}\n`).join("")}Agent: ${reply || "(no answer)"}\n\n`,
    );
    if (!result || result.is_error)
      throw new Error(
        `claude gave no answer to "${prompt}" (exit ${r.status}): ${(r.stderr || reply || String(r.error ?? "")).trim().split("\n")[0]}`,
      );
    return reply;
  };
}
