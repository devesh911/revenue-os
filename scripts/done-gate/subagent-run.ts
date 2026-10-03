// What a subagent's own records show: the model each of its replies came from, whether it handed its report back,
// and the Agent call that started it. Claude Code writes them side by side: agent-<id>.jsonl, one record per line,
// and agent-<id>.meta.json, whose `toolUseId` names that call (an agent a workflow script started has none).

import { readFileSync } from "node:fs";

type Reply = {
  type?: string;
  message?: { model?: unknown; content?: unknown };
};

/** Its records, or nothing when they can't be read: a missing transcript or meta file counts as no run at all. */
export function runOf(transcript: string | undefined) {
  if (!transcript?.endsWith(".jsonl")) return;
  try {
    const replies = readFileSync(transcript, "utf8")
      .split("\n")
      .flatMap((line): Reply[] => {
        try {
          return [JSON.parse(line)];
        } catch {
          return []; // a line still being written
        }
      })
      .filter((r) => r?.type === "assistant");
    const meta = JSON.parse(
      readFileSync(transcript.replace(/\.jsonl$/, ".meta.json"), "utf8"),
    ) as { toolUseId?: unknown };
    return {
      // Claude Code's own notices (a usage limit reached) are written as replies from "<synthetic>": no model's.
      models: replies
        .map((r) => String(r.message?.model ?? ""))
        .filter((m) => m !== "<synthetic>"),
      handedBack: replies.some(
        (r) =>
          Array.isArray(r.message?.content) &&
          r.message.content.some(
            (c) => c?.type === "tool_use" && c.name === "SubagentHandback",
          ),
      ),
      startedBy:
        typeof meta.toolUseId === "string" ? meta.toolUseId : undefined,
    };
  } catch {
    return;
  }
}
