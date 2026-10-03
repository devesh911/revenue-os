// The checkpoint: a short note an agent keeps up to date as it works on a branch (what is done, what failed, the
// exact next step), with Devesh's request word for word, kept per checkout and branch in the gate's record, so a
// session restarted mid-item is shown where the last one stood: when it starts in that checkout (session-start.ts),
// or before its first command there when it started elsewhere (hook.ts). Only `bun run gate checkpoint` writes it,
// and the gate, not the agent, fills in the request: Devesh's typed messages from Claude Code's transcripts of the
// sessions that wrote it (devesh-words.ts), or, when he typed none, the branch's roadmap item. A stop on a branch
// that builds an item is sent back until its checkpoint was written on the code as the session leaves it (stop.ts),
// and the session that writes it answers for the branch's change (interrupted.ts).

import { readFileSync } from "node:fs";
import { parseRoadmap } from "../../docs/tracker/parse.js";
import { idOf } from "./checkouts";
import { itemOf, promptsOf } from "./devesh-words";
import { git } from "./git";
import { branchOf, hold, WROTE } from "./interrupted";
import { snapshot } from "./snapshot";
import type { Store } from "./store";

const PARTS = { done: "Done", failed: "Failed", next: "Next step" };
type Part = keyof typeof PARTS;
type Said = { at?: string; text: string };
type Checkpoint = Record<Part, string> & {
  at: string;
  tree?: string; // the code it was written on
  request: Said[];
  item?: string;
};

const NOTE_MAX = 2_000; // the three parts together: a short note
const SHOWN_MAX = 6_000; // Claude Code caps a hook's added context at 10,000 characters
const HOW = `Keep it up to date after each commit and before you stop: \`bun run gate checkpoint --done "<what is done>" --failed "<what failed, or nothing>" --next "<the exact next step>"\` (the gate adds Devesh's request, word for word, itself).`;

// The branch's name is hashed: the record's file names turn "/" into "_", which would make feat/x and feat_x one.
const keyOf = (root: string) =>
  `${idOf(root)}-${Bun.hash(branchOf(root)).toString(36)}`;
const nameOf = (root: string) =>
  branchOf(root) ? `branch ${branchOf(root)}` : "this detached checkout";
const none = (root: string) => `No checkpoint of ${nameOf(root)} yet. ${HOW}`;
const builds = (root: string) => {
  const branch = branchOf(root);
  return (
    !!branch &&
    !!git(root, ["config", `branch.${branch}.description`], {}, true)
  );
};

function read(root: string, store: Store): Checkpoint | undefined {
  try {
    return JSON.parse(store.get("checkpoint", keyOf(root)) ?? "");
  } catch {
    return undefined;
  }
}

/** `--done <text> --failed <text> --next <text>`: each part once, none empty, short; else nothing. */
function partsOf(args: string[]) {
  const parts: Partial<Record<Part, string>> = {};
  for (let i = 0; i < args.length; i += 2) {
    const part = (args[i] ?? "").replace(/^--/, "") as Part;
    const text = args[i + 1]?.trim();
    if (!args[i]?.startsWith("--") || !Object.hasOwn(PARTS, part)) return;
    if (part in parts || !text) return;
    parts[part] = text;
  }
  const all = Object.keys(PARTS).every((p) => p in parts);
  return all && Object.values(parts).join("").length <= NOTE_MAX
    ? (parts as Record<Part, string>)
    : undefined;
}

/**
 * Devesh's request: what the checkpoint held, then what he typed in the session that last worked in the checkout
 * (the one running this command: the check before it noted the checkout), oldest first, each message once.
 */
function requestOf(root: string, store: Store, before: Said[]) {
  const session = store.get("toucher", idOf(root));
  const transcript = session && store.get("transcript", session);
  let text = "";
  try {
    text = transcript ? readFileSync(transcript, "utf8") : "";
  } catch {
    // no transcript to read: nothing typed is known
  }
  const typed = promptsOf(text).typed.reverse();
  return [
    ...before,
    ...typed.filter((t) => !before.some((b) => b.text === t.text)),
  ];
}

const block = (s: Said) =>
  `--- typed by Devesh${s.at ? ` at ${s.at}` : ""} ---\n${s.text}`;

/**
 * His messages within `room` characters: whole when they fit; else his first (the request) and as many of his newest
 * (his latest corrections) as fit, the ones between left out; a message too long even then is cut at its end.
 */
function fit(request: Said[], room: number) {
  const head =
    "Devesh's request, word for word, oldest first (the gate read it from Claude Code's transcripts of the sessions that wrote this checkpoint):";
  const join = (said: Said[], left: number) =>
    [
      head,
      ...said.map((s, i) =>
        i === 1 && left
          ? `(${left} of his messages left out here: the sessions' transcripts hold every message whole.)\n${block(s)}`
          : block(s),
      ),
    ].join("\n");
  const kept = [...request];
  while (
    kept.length > 2 &&
    join(kept, request.length - kept.length).length > room
  )
    kept.splice(1, 1);
  const text = join(kept, request.length - kept.length);
  const cut =
    "\n(Cut here: the sessions' transcripts hold every message whole.)";
  return text.length > room
    ? `${text.slice(0, room - cut.length)}${cut}`
    : text;
}

/** The checkpoint as a restarted session is shown it, or nothing when there is none. */
function shown(root: string, store: Store) {
  const c = read(root, store);
  if (!c) return;
  const head = `Checkpoint of ${nameOf(root)} in this checkout, last written ${c.at}. ${HOW}`;
  const note = (Object.keys(PARTS) as Part[])
    .map((p) => `${PARTS[p]}: ${c[p]}`)
    .join("\n");
  const room = SHOWN_MAX - head.length - note.length - 4; // the two blank lines between the three
  const request = c.request.length
    ? fit(c.request, room)
    : c.item
      ? `Devesh typed nothing in the sessions that wrote this checkpoint, so the request is this branch's roadmap item, word for word:\n${c.item}`
      : "Devesh typed nothing in the sessions that wrote this checkpoint, and the branch names no roadmap item, so no request is known.";
  return [head, request, note].join("\n\n");
}

/** At a session's start: the checkpoint, or a reminder to write one on a branch that records the item it builds. */
export function checkpointAtStart(root: string, store: Store) {
  return shown(root, store) ?? (builds(root) ? none(root) : undefined);
}

/** The checkouts `session` has noted, each with the checkout it saw there: compared before and after a tool call. */
export const seenBy = (store: Store, session: string) =>
  new Map(
    store
      .list("seen", `${session}-`)
      .map(({ key }) => [key, store.get("seen", key) ?? ""]),
  );

/**
 * Before a tool call: the checkpoint of each checkout the call works in for the first time (`before`: what the
 * session had noted), so a session that started elsewhere is shown it before it acts there. Refuses the call once,
 * as the only way a hook's words reach the agent before a command; the agent runs it again.
 */
export function showOnArrival(
  store: Store,
  session: string,
  before: Map<string, string>,
) {
  const roots = [...seenBy(store, session)]
    .filter(([key, seen]) => seen && before.get(key) !== seen)
    .map(([, seen]) => seen.split("\n")[0] ?? "");
  const notes = roots.flatMap((root) => {
    const s = shown(root, store);
    return s ? [`In ${root}: ${s}`] : [];
  });
  if (!notes.length) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `The done gate held this first command in a checkout with a checkpoint back, to show it to you before you act there. Run your command again: it goes through.\n\n${notes.join("\n\n")}`,
      },
      systemMessage: `Done gate: showed the agent the checkpoint of ${roots.map((r) => nameOf(r)).join(" and ")} before its first command there; it runs that command again`,
    }),
  );
}

/**
 * At a stop, for the checkouts it judged (`work`): the first on a branch that builds an item whose checkpoint was not
 * written on its code as the session leaves it, with what to do; else nothing.
 */
export function checkpointOwed(
  work: { root: string; tree: string }[],
  store: Store,
) {
  const w = work.find(
    (w) => builds(w.root) && read(w.root, store)?.tree !== w.tree,
  );
  if (!w) return;
  return {
    headline: `the checkpoint of ${nameOf(w.root)} is not written on the code as the agent leaves it`,
    reason: `You can't finish yet: ${nameOf(w.root)} builds a roadmap item, and its checkpoint must say where you stop, written after your last change, so a session restarted after you can pick up from it. ${HOW}`,
  };
}

/** `bun run gate checkpoint [--done … --failed … --next …]`: write this checkout's checkpoint, then show it. */
export function checkpointCommand(root: string, store: Store, args: string[]) {
  if (args.length) {
    const parts = partsOf(args);
    if (!parts) {
      console.error(
        `Checkpoint ✗ not saved: give each of --done, --failed and --next once, none empty, ${NOTE_MAX} characters at most together, as in: bun run gate checkpoint --done "<what is done>" --failed "<what failed, or nothing>" --next "<the exact next step>"`,
      );
      return 2;
    }
    const roadmap = git(root, ["show", "origin/main:ROADMAP.md"], {}, true);
    const items = parseRoadmap(roadmap).slices.flatMap((s) =>
      s.items.map((i) => i.text),
    );
    const c: Checkpoint = {
      at: new Date().toISOString(),
      tree: snapshot(root, false).tree,
      request: requestOf(root, store, read(root, store)?.request ?? []),
      item: itemOf(root, items).item,
      ...parts,
    };
    store.put("checkpoint", keyOf(root), JSON.stringify(c));
    // Its writer answers for the branch's change: each of its stops judges it until one passes.
    const writer = store.get("toucher", idOf(root));
    if (writer && branchOf(root)) hold(store, writer, root, WROTE);
  }
  console.log(shown(root, store) ?? none(root));
  return 0;
}
