// The verifier agent at each moment the gate sees it: the Agent call that starts it (on a model the gate allows),
// its start (handed Devesh's words), each of its commands, its hand-back and its stop. Its ruling counts only when it
// is its own delivered report: in auto mode the message of its SubagentHandback call, otherwise its last message when
// it handed nothing back; only from a verifier an Agent call of this session started (a workflow script's verifier
// reports through StructuredOutput, and never counts); only when every reply in its own transcript came from an
// allowed model; and only for code it saw: each checkout it ran a command in, as that code was at its last command
// there. When a ruling it delivered does not count, Devesh is told why.

import { ranIn, rootsOf } from "./checkouts";
import { requestFor } from "./devesh-words";
import { type HookInput, say } from "./hook-io";
import { deny } from "./merge-gate";
import { RULING_FORMS, rulingOf } from "./ruling";
import { snapshot } from "./snapshot";
import type { Store } from "./store";
import { runOf } from "./subagent-run";
import { DELIVERED, type Ruling } from "./verdict";

/** The models the verifier may run on; .claude/agents/verifier.md names one of them. No hook input names a model. */
export const ALLOWED_MODELS = ["claude-opus-5-5"];

const keyOf = (session: string, input: HookInput) =>
  `${session}-${input.agent_id}`;
/** Each checkout the verifier ran a command in, with its code as it was at the last one. */
const sawOf = (store: Store, key: string) =>
  JSON.parse(store.get("verifier-saw", key) ?? "{}") as Record<string, string>;
const treeOf = (root: string) => {
  try {
    return snapshot(root, false).tree;
  } catch {
    return undefined; // a checkout that can't be read holds no code to rule on
  }
};

/**
 * Before each of the verifier's shell commands: the code, as it is now, of each checkout the command runs in. Every
 * agent of a session shares its id (a workflow's builders too), so the session's checkouts would be too many.
 */
export function verifierWorked(
  repo: string,
  input: HookInput,
  store: Store,
  session: string,
) {
  const command = input.tool_input?.command;
  if (
    input.agent_type !== "verifier" ||
    !input.agent_id ||
    typeof command !== "string"
  )
    return; // reading or searching files runs nothing in their checkout
  const key = keyOf(session, input);
  const saw = sawOf(store, key);
  for (const root of ranIn(repo, input.cwd ?? repo, command)) {
    const tree = treeOf(root);
    if (tree) saw[root] = tree;
  }
  store.put("verifier-saw", key, JSON.stringify(saw));
}

type Held = Ruling & { trees: string[] };

/** A ruling on the code the verifier saw, or why it can't be one, told to the verifier (`you`) and to Devesh (`it`). */
function held(
  ruling: Ruling,
  store: Store,
  key: string,
): { ruling: Held } | { you: string; it: string } {
  const saw = Object.entries(sawOf(store, key));
  if (!saw.length)
    return {
      you: "your ruling would cover no code: you ran no command in any checkout. Run your checks in the checkout that holds the change (its worktree, if it has one), then deliver your report again.",
      it: "it ran no command in any checkout, so it covers no code",
    };
  const changed = saw.filter(([root, tree]) => treeOf(root) !== tree);
  const where = changed.map(([root]) => root).join(" and ");
  return changed.length
    ? {
        you: `the code in ${where} changed after your last command there, so your ruling would cover code you have not seen. Run your checks there again, then deliver your report again.`,
        it: `the code in ${where} changed after its last command there`,
      }
    : { ruling: { ...ruling, trees: saw.map(([, tree]) => tree) } };
}

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
  const key = keyOf(session, input);
  const h = held(ruling, store, key);
  if ("you" in h) return deny(h.you, "hand-back");
  store.put("handed", key, JSON.stringify(h.ruling));
}

/** When the verifier starts: the request, from ROADMAP.md on origin/main and Claude Code's transcript of the session. */
export function verifierStarts(
  repo: string,
  input: HookInput,
  store: Store,
  session: string,
) {
  store.put("verifier-running", keyOf(session, input), "1"); // until its stop: a stop meanwhile awaits its ruling (stop.ts)
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SubagentStart",
        additionalContext: requestFor(
          repo,
          input.transcript_path,
          rootsOf(repo, store, session, input.cwd).roots,
        ),
      },
    }),
  );
}

const sendBack = (why: string) => {
  process.stderr.write(why);
  process.exit(2);
};

/** When the verifier stops: its delivered ruling, if it counts, becomes the gate's record for that exact code. */
export function verifierStops(input: HookInput, store: Store, session: string) {
  const key = keyOf(session, input);
  store.take("verifier-running", key);
  const handed = store.take("handed", key);
  const stated = rulingOf(input.last_assistant_message ?? "");
  const run = runOf(input.agent_transcript_path);
  const voided = (why: string) => {
    if (handed || stated || run?.handedBack)
      say(`Done gate ⚠ the verifier's ruling does not count: ${why}`);
  };
  if (!run)
    return voided(
      `Claude Code's record of its run (${input.agent_transcript_path ?? "no transcript named"}, and the meta file beside it) can't be read`,
    );
  if (!run.startedBy)
    return voided(
      "a workflow script started it, so it reports through StructuredOutput, not to the done gate",
    );
  if (store.get("verifier-call", run.startedBy) !== session)
    return voided(
      "the done gate saw no Agent call of this session start it (a session that loaded its hooks before the gate read Agent calls must be restarted)",
    );
  const model = run.models.length
    ? run.models.find((m) => !ALLOWED_MODELS.includes(m))
    : "no recorded reply";
  if (model !== undefined)
    return voided(`it ran on ${model}, not ${ALLOWED_MODELS.join(" or ")}`);
  let ruling = handed ? (JSON.parse(handed) as Held) : undefined;
  // Outside auto mode its last message is what it delivers, unless it handed a report back; it is sent back once.
  if (!ruling && input.permission_mode !== "auto" && !run.handedBack) {
    const h = stated && held(stated, store, key);
    if (h && "ruling" in h) ruling = h.ruling;
    else if (!input.stop_hook_active)
      sendBack(
        h
          ? `Before you finish: ${h.you}`
          : `Before you finish, end your report with your ruling, alone on its last line: ${RULING_FORMS}.`,
      );
    else if (h) return voided(h.it);
  }
  for (const tree of ruling?.trees ?? [])
    store.put(
      DELIVERED,
      tree,
      JSON.stringify({ verdict: ruling?.verdict, note: ruling?.note }),
    );
}
