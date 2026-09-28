// `bun run cycle` — where we are in ROADMAP.md, printed so no agent has to remember it. The agent
// hooks (.claude/settings.json and .codex/hooks.json, through scripts/cycle-hook.sh) show it to
// every session, so the plan survives /clear, compaction and off-topic prompts.
//   --check   (default) format problems in this checkout's ROADMAP.md and STATE.md; exit 1 if any
//   --banner  session start, resume, /clear, compaction: fetch main, then the whole picture
//   --pin     every prompt: one line
// --banner and --pin read the plan from origin/main (a build branch ticks its own item before it
// merges) and always exit 0: hooks drop a failing command's output, so they print CYCLE UNKNOWN.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  currentSlice,
  nextItem,
  parseRoadmap,
  parseState,
} from "../docs/tracker/parse.js";

export type Cycle = {
  roadmap: string;
  state: string;
  branch: string;
  item: string; // what this branch builds: git config branch.<name>.description
  from: string;
};

const ROOT = join(import.meta.dir, "..");
const unknown = (why: string) =>
  `CYCLE UNKNOWN: ${why}. Read ROADMAP.md and fix it before any other work.`;
const cut = (s: string, n = 100) =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

export const problems = (roadmap: string, state: string) => [
  ...parseRoadmap(roadmap).problems,
  ...parseState(state).problems,
];

function where(c: Cycle) {
  const { slices } = parseRoadmap(c.roadmap);
  const cur = currentSlice(slices);
  return { slices, cur, next: nextItem(cur) };
}

export function pin(c: Cycle): string {
  const { slices, cur, next } = where(c);
  if (!slices.length) return unknown("no slices found in ROADMAP.md");
  const mine = c.item
    ? `this branch builds "${cut(c.item)}"`
    : `${c.branch || "this checkout"} has no roadmap item`;
  const now = !cur
    ? "no slice can be built now (each waits on Devesh)"
    : `current: Slice ${cur.n} (${cur.title}), ${next ? `next item "${cut(next.text)}"` : "no agent items left"}`;
  return `CYCLE: ${mine} · ${now}. A prompt about anything else follows AGENTS.md → The loop, step 1 (question: answer only; build ask: "off-roadmap or replan?").`;
}

export function banner(c: Cycle): string {
  const { slices, cur, next } = where(c);
  if (!slices.length) return unknown("no slices found in ROADMAP.md");
  const { phase } = parseState(c.state);
  const found = problems(c.roadmap, c.state);
  const name = c.branch && c.branch !== "main" ? c.branch : "<name>";
  const lines = [
    `CURRENT CYCLE, read from ROADMAP.md on ${c.from}. The plan lives in the repo, not in this chat.`,
    `Phase: ${phase} (${phase === "LIVE" ? "only humans merge" : "agents may merge on observed-green checks"}; STATE.md line 1).`,
    cur
      ? `Current slice: Slice ${cur.n}: ${cur.title} (${cur.Status}, ${cur.items.filter((i) => i.done).length} of ${cur.items.length} items done).\nProof Devesh will watch: ${cur.Proof ?? ""}\nNext item: ${next ? next.text : "none left for agents. Set the slice to proof ready and ask Devesh to watch the proof."}`
      : "No slice can be built now: each unfinished slice is proof ready (waiting for Devesh to watch it) or blocked. Tell Devesh; do not start other work.",
    c.item
      ? `This branch (${c.branch}) builds: ${c.item}`
      : `${c.branch ? `This branch (${c.branch})` : "This checkout"} has no roadmap item. Build only on a branch made for one item, off origin/main, and record the item: git config branch.${name}.description "<item text>"`,
    'New asks (AGENTS.md → The loop, step 1). A question or look-up: answer it; no branch switch, no code. Marketing-site work: the Side track in ROADMAP.md. Any other build ask: reply "That is off the current slice: build it as an off-roadmap PR, or replan (add it to a slice)?" and build nothing until Devesh picks.',
    'Done means seen working (AGENTS.md → Definition of done). Only Devesh writes a date after "Seen by Devesh:".',
  ];
  if (found.length)
    lines.push(
      "Format problems in ROADMAP.md or STATE.md; fix them first:",
      ...found.slice(0, 5).map((p) => `- ${p}`),
    );
  return lines.join("\n");
}

function git(...args: string[]): string {
  const r = spawnSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 5000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return r.status === 0 ? r.stdout.trim() : "";
}

if (import.meta.main) {
  const flag = process.argv[2] ?? "--check";
  const local = (f: string) => readFileSync(join(ROOT, f), "utf8");
  if (flag === "--check") {
    const found = problems(local("ROADMAP.md"), local("STATE.md"));
    for (const p of found) console.error(p);
    console.log(
      found.length
        ? `${found.length} format problem(s) in ROADMAP.md or STATE.md`
        : "ROADMAP.md and STATE.md: no format problems",
    );
    process.exit(found.length ? 1 : 0);
  }
  if (flag !== "--banner" && flag !== "--pin") {
    console.error("usage: bun run cycle [--check | --banner | --pin]");
    process.exit(2);
  }
  let out: string;
  try {
    if (flag === "--banner") git("fetch", "--quiet", "origin", "main");
    const branch = git("branch", "--show-current");
    const onMain = git("show", "origin/main:ROADMAP.md");
    const c: Cycle = {
      roadmap: onMain || local("ROADMAP.md"),
      state: git("show", "origin/main:STATE.md") || local("STATE.md"),
      branch,
      item: branch
        ? git("config", `branch.${branch}.description`).replace(/\s+/g, " ")
        : "",
      from: onMain ? "origin/main" : "this checkout (origin/main unavailable)",
    };
    out = flag === "--banner" ? banner(c) : pin(c);
  } catch (e) {
    out = unknown((e as Error).message);
  }
  console.log(out);
}
