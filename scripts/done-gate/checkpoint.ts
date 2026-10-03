// The checkpoint: a short note an agent keeps up to date as it works on a branch (what is done, what failed, the
// exact next step), with Devesh's request word for word, kept per checkout and branch in the gate's record, so a
// session restarted mid-item is shown where the last one stood (session-start.ts). Only `bun run gate checkpoint`
// writes it, and the gate, not the agent, fills in the request: Devesh's typed messages from Claude Code's
// transcripts of the sessions that wrote it (devesh-words.ts), or, when he typed none, the branch's roadmap item.

import { readFileSync } from "node:fs";
import { parseRoadmap } from "../../docs/tracker/parse.js";
import { idOf } from "./checkouts";
import { itemOf, promptsOf } from "./devesh-words";
import { git } from "./git";
import type { Store } from "./store";

const PARTS = { done: "Done", failed: "Failed", next: "Next step" };
type Part = keyof typeof PARTS;
type Said = { at?: string; text: string };
type Checkpoint = Record<Part, string> & {
  at: string;
  request: Said[];
  item?: string;
};

const NOTE_MAX = 2_000; // the three parts together: a short note
const SHOWN_MAX = 6_000; // Claude Code caps a hook's added context at 10,000 characters
const HOW = `Keep it up to date after each commit and before you stop: \`bun run gate checkpoint --done "<what is done>" --failed "<what failed, or nothing>" --next "<the exact next step>"\` (the gate adds Devesh's request, word for word, itself).`;

const branchOf = (root: string) =>
  git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], {}, true);
const keyOf = (root: string) => `${idOf(root)}-${branchOf(root)}`;
const nameOf = (root: string) =>
  branchOf(root) ? `branch ${branchOf(root)}` : "this detached checkout";
const none = (root: string) => `No checkpoint of ${nameOf(root)} yet. ${HOW}`;

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

/** The checkpoint as a restarted session is shown it, or nothing when there is none. */
function shown(root: string, store: Store) {
  const c = read(root, store);
  if (!c) return;
  const head = `Checkpoint of ${nameOf(root)} in this checkout, last written ${c.at}. ${HOW}`;
  const note = (Object.keys(PARTS) as Part[])
    .map((p) => `${PARTS[p]}: ${c[p]}`)
    .join("\n");
  const request = c.request.length
    ? `Devesh's request, word for word, oldest first (the gate read it from Claude Code's transcripts of the sessions that wrote this checkpoint):\n${c.request.map((s) => `--- typed by Devesh${s.at ? ` at ${s.at}` : ""} ---\n${s.text}`).join("\n")}`
    : c.item
      ? `Devesh typed nothing in the sessions that wrote this checkpoint, so the request is this branch's roadmap item, word for word:\n${c.item}`
      : "Devesh typed nothing in the sessions that wrote this checkpoint, and the branch names no roadmap item, so no request is known.";
  const room = SHOWN_MAX - head.length - note.length;
  const cut = `\n(Cut here: the sessions' transcripts hold every message whole.)`;
  return [
    head,
    request.length > room
      ? `${request.slice(0, room - cut.length)}${cut}`
      : request,
    note,
  ].join("\n\n");
}

/** At a session's start: the checkpoint, or a reminder to write one on a branch that records the item it builds. */
export function checkpointAtStart(root: string, store: Store) {
  const branch = branchOf(root);
  const builds =
    branch && git(root, ["config", `branch.${branch}.description`], {}, true);
  return shown(root, store) ?? (builds ? none(root) : undefined);
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
      request: requestOf(root, store, read(root, store)?.request ?? []),
      item: itemOf(root, items).item,
      ...parts,
    };
    store.put("checkpoint", keyOf(root), JSON.stringify(c));
  }
  console.log(shown(root, store) ?? none(root));
  return 0;
}
