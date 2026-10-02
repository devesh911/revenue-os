// The verifier agent at each moment the gate sees it: the Agent call that starts it (on a model the gate allows),
// its start (handed Devesh's words), its hand-back and its stop. Its ruling counts only when it is its own delivered
// report: in auto mode the message of its SubagentHandback call, otherwise its last message when it handed nothing
// back; only from a verifier an Agent call of this session started (a workflow script's verifier reports through
// StructuredOutput, and never counts); and only when every reply in its own transcript came from an allowed model.

import { rootsOf } from "./checkouts";
import { requestFor } from "./devesh-words";
import { type HookInput, say } from "./hook-io";
import { deny } from "./merge-gate";
import { RULING_FORMS, rulingOf } from "./ruling";
import { snapshot } from "./snapshot";
import type { Store } from "./store";
import { runOf } from "./subagent-run";
import type { Ruling } from "./verdict";

/** The models the verifier may run on; .claude/agents/verifier.md names one of them. No hook input names a model. */
export const ALLOWED_MODELS = ["claude-opus-5-5"];

type Held = Ruling & { trees: string[] };

const workedIn = (store: Store, key: string) =>
  JSON.parse(store.get("verifier-saw", key) ?? "[]") as string[];

/**
 * Before each of the verifier's own commands and edits: the checkouts it works in, whose code its ruling is about.
 * Every agent of a session shares its id (a workflow's builders too), so the session's checkouts would be too many.
 */
export function verifierWorked(
  input: HookInput,
  store: Store,
  session: string,
  checkouts: string[],
) {
  if (input.agent_type !== "verifier" || !input.agent_id) return;
  const key = `${session}-${input.agent_id}`;
  const all = new Set([...workedIn(store, key), ...checkouts]);
  store.put("verifier-saw", key, JSON.stringify([...all]));
}

/** A ruling, for the exact code at this moment of every checkout the verifier worked in. */
const held = (ruling: Ruling, store: Store, key: string): Held => ({
  ...ruling,
  trees: workedIn(store, key).flatMap((r) => {
    try {
      return [snapshot(r, false).tree];
    } catch {
      return []; // a checkout that can't be read holds no code to rule on
    }
  }),
});

/** Before an Agent call that starts the verifier, or a SubagentHandback call that delivers a report. */
export function verifierCall(input: HookInput, store: Store, session: string) {
  const tool = input.tool_input ?? {};
  if (input.tool_name === "Agent") {
    if (tool.subagent_type !== "verifier") return;
    if (
      tool.model !== undefined &&
      !ALLOWED_MODELS.includes(String(tool.model))
    )
      return deny(
        `the verifier runs only on ${ALLOWED_MODELS.join(" or ")}, the model .claude/agents/verifier.md names. Call it again with no \`model\`.`,
        "verifier call",
      );
    if (input.tool_use_id)
      store.put("verifier-call", input.tool_use_id, session);
    return;
  }
  if (input.agent_type !== "verifier" || !input.agent_id) return; // not the verifier's own report
  const ruling = rulingOf(typeof tool.message === "string" ? tool.message : "");
  if (!ruling)
    return deny(
      `your report must end with your ruling, alone on its last line: ${RULING_FORMS}. Hand it back again with that line.`,
      "hand-back",
    );
  const key = `${session}-${input.agent_id}`;
  const report = held(ruling, store, key);
  if (!report.trees.length)
    return deny(
      "your ruling would cover no code: you ran no command in any checkout. Run your checks in the checkout that holds the change (its worktree, if it has one), then hand your report back again.",
      "hand-back",
    );
  store.put("handed", key, JSON.stringify(report));
}

/** When the verifier starts: Devesh's words and the roadmap item's text, from records the building agent did not write. */
export function verifierStarts(
  repo: string,
  input: HookInput,
  store: Store,
  session: string,
) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SubagentStart",
        additionalContext: requestFor(
          input.transcript_path,
          rootsOf(repo, store, session, input.cwd).roots,
        ),
      },
    }),
  );
}

/** When the verifier stops: its delivered ruling, if it counts, becomes the gate's record for that exact code. */
export function verifierStops(input: HookInput, store: Store, session: string) {
  const key = `${session}-${input.agent_id}`;
  const handed = store.take("handed", key);
  const run = runOf(input.agent_transcript_path);
  if (!run?.startedBy || store.get("verifier-call", run.startedBy) !== session)
    return; // no Agent call of this session started it, or its records are missing: nothing it says counts
  const model = run.models.length
    ? run.models.find((m) => !ALLOWED_MODELS.includes(m))
    : "no recorded reply";
  if (model !== undefined)
    return say(
      `Done gate ⚠ the verifier's ruling does not count: it ran on ${model}, not ${ALLOWED_MODELS.join(" or ")}`,
    );
  let ruling = handed ? (JSON.parse(handed) as Held) : undefined;
  // Outside auto mode its last message is what it delivers, unless it handed a report back.
  if (!ruling && input.permission_mode !== "auto" && !run.handedBack) {
    const stated = rulingOf(input.last_assistant_message ?? "");
    if (stated) ruling = held(stated, store, key);
    else if (!input.stop_hook_active) {
      process.stderr.write(
        `Before you finish, end your report with your ruling, alone on its last line: ${RULING_FORMS}.`,
      );
      process.exit(2);
    }
  }
  if (ruling && !ruling.trees.length)
    return say(
      "Done gate ⚠ the verifier's ruling covers no code: it ran no command in any checkout",
    );
  for (const tree of ruling?.trees ?? [])
    store.put(
      "verdict",
      tree,
      JSON.stringify({ verdict: ruling?.verdict, note: ruling?.note }),
    );
}
