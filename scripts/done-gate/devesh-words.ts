// What the verifier is handed when it starts, from records the building agent does not write: the roadmap item
// each checkout's branch records, and Devesh's own typed words from the session's transcript (a script's prompts,
// marked as script output, when a script started the session).

import { readFileSync } from "node:fs";
import { git } from "./git";

type Prompt = {
  type?: string;
  isMeta?: boolean;
  origin?: { kind?: string };
  promptSource?: string;
  timestamp?: string;
  message?: { content?: unknown };
};

// Claude Code hands a subagent context over 10,000 characters only as a file path and a short preview.
const BUDGET = 9_000;

const textOf = (content: unknown) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .filter((c) => c?.type === "text" && typeof c.text === "string")
          .map((c) => c.text as string)
          .join("\n")
      : "";

/**
 * PURE: a session transcript → the prompts Devesh typed (`origin.kind` "human"), and, when the session's first
 * prompt has no origin (a script or the SDK sent it), the prompts with none. Tool results, system reminders,
 * task notifications and subagents' hand-backs are not prompts anyone typed.
 */
function promptsOf(transcript: string) {
  const prompts = transcript.split("\n").flatMap((line): Prompt[] => {
    if (!line.includes('"user"')) return [];
    try {
      const r = JSON.parse(line) as Prompt;
      return r.type === "user" && !r.isMeta && (r.origin || r.promptSource)
        ? [r]
        : [];
    } catch {
      return [];
    }
  });
  return {
    typed: prompts.filter((p) => p.origin?.kind === "human"),
    byScript:
      prompts[0] && !prompts[0].origin ? prompts.filter((p) => !p.origin) : [],
  };
}

/** Newest first, each whole under its own heading, while they fit; then how many older ones were left out. */
function newestFirst(prompts: Prompt[], heading: string, path: string) {
  const out: string[] = [];
  let size = 0;
  for (const p of [...prompts].reverse()) {
    const block = `--- ${heading}${p.timestamp ? ` at ${p.timestamp}` : ""} ---\n${textOf(p.message?.content)}`;
    if (out.length && size + block.length > BUDGET) {
      out.push(
        `(${prompts.length - out.length} older ones are left out; the session transcript, ${path}, holds them)`,
      );
      break;
    }
    out.push(block);
    size += block.length;
  }
  return out.join("\n");
}

/** The note the verifier starts with: each checkout's roadmap item, then what Devesh typed in the session. */
export function requestFor(transcript: string | undefined, roots: string[]) {
  let text = "";
  try {
    text = transcript ? readFileSync(transcript, "utf8") : "";
  } catch {
    // no transcript to read: nothing typed is known
  }
  const { typed, byScript } = promptsOf(text);
  const items = roots.map((root) => {
    const branch = git(
      root,
      ["symbolic-ref", "--quiet", "--short", "HEAD"],
      {},
      true,
    );
    const item =
      branch && git(root, ["config", `branch.${branch}.description`], {}, true);
    return !branch
      ? `${root} is on no branch, so it records no roadmap item.`
      : item
        ? `Roadmap item recorded on branch ${branch} (its description), word for word:\n${item}`
        : `Branch ${branch} records no roadmap item text (its description is empty).`;
  });
  return [
    "The done gate hands the verifier this from records the building agent does not write: each checkout's branch, and the session's transcript.",
    ...items,
    ...(byScript.length
      ? [
          "A script started this session. Its prompts, newest first, are script output, not typed by Devesh:",
          newestFirst(
            byScript,
            "script output, not typed by Devesh",
            transcript ?? "",
          ),
        ]
      : []),
    typed.length
      ? `Devesh's typed messages in this session, newest first, each word for word:\n${newestFirst(typed, "typed by Devesh", transcript ?? "")}`
      : "Devesh typed nothing in this session, so the roadmap item's text above is the request.",
  ].join("\n\n");
}
