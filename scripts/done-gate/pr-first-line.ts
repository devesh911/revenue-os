// A pull request's body says on its first line what the pull request is (AGENTS.md → The loop, step 4): a roadmap
// item agents may build now, a replan, Side-track work or off-roadmap work. ROADMAP.md is read with the tracker's
// own reader, both as the pull request leaves it and as main has it.

import {
  currentSlice,
  type Item,
  parseRoadmap,
  plain,
} from "../../docs/tracker/parse.js";

const FORMS =
  "`Roadmap: Slice N — <item>` (an item of the current slice, its text as ROADMAP.md has it, whole or up to its first colon, a note in brackets allowed after it), `Roadmap: Slice N — replan: <what>` (a pull request that changes ROADMAP.md and ticks no item), `Roadmap: Side track — <what>` or `Roadmap: off-roadmap — <what>`, each with an em dash (—)";
const LINE = /^Roadmap: (?:Slice (\d+)|Side track|off-roadmap) — (\S.*)$/;

/** PURE: a name as compared: plain text (as a branch's description is matched), no full stop at its end. */
const key = (s: string) => plain(s).replace(/[\s.]+$/, "");
/** PURE: the names an item answers to: its whole text, and its text up to its first colon. */
const namesOf = (i: Item) => [i.text, i.text.split(/:\s/)[0] ?? ""].map(key);
const cut = (s: string) => (s.length > 100 ? `${s.slice(0, 99)}…` : s);

/**
 * PURE: the PR body, ROADMAP.md as the pull request leaves it and as main has it, and whether the pull request
 * changes it → what is wrong with the body's first line, read exactly as written (no problem when it is one of the
 * forms). An agent's item counts only in the current slice, as either copy has it, so the pull request that moves
 * an item in, or ticks a slice's last item and sets it to proof ready, still names it; Devesh's items count in any
 * slice. An item main already has ticked counts only for a follow-up that adds to its evidence. A replan ticks no
 * item: a pull request that ticks one builds it, and names it.
 */
export function firstLineProblems(
  body: string,
  roadmap: string,
  main: string,
  changed: boolean,
): string[] {
  const first = (body.split(/\r?\n/, 1)[0] ?? "").trimEnd();
  const m = first.match(LINE);
  const say = (what: string) => [`the PR body's first line ${what}: ${FORMS}`];
  if (!m)
    return say(
      `"${cut(first)}" is not one of the forms AGENTS.md → The loop, step 4, gives`,
    );
  const [, n, what = ""] = m;
  if (n === undefined) return [];
  const now = parseRoadmap(roadmap).slices;
  const was = parseRoadmap(main).slices;
  const slice = now.find((s) => s.n === Number(n));
  if (!slice) return say(`names Slice ${n}, which ROADMAP.md does not have`);
  const tickedOnMain = (i: Item) =>
    was
      .flatMap((s) => s.items)
      .find((d) => d.done && plain(d.text) === plain(i.text));
  if (/^replan: \S/.test(what)) {
    const ticks = now
      .flatMap((s) => s.items)
      .find((i) => i.done && !tickedOnMain(i));
    if (!changed)
      return say(
        `says it replans Slice ${n}, but the pull request doesn't change ROADMAP.md`,
      );
    return ticks
      ? say(
          `says it replans Slice ${n}, but the pull request ticks "${cut(ticks.text)}", so it builds that item: name it instead`,
        )
      : [];
  }
  const named = [what, what.replace(/(?:\s*\([^()]*\))+$/, "")].map(key);
  const item = slice.items.find((i) =>
    namesOf(i).some((x) => named.includes(x)),
  );
  if (!item)
    return say(`names "${what}", which is no item of Slice ${n} in ROADMAP.md`);
  const before = tickedOnMain(item);
  if (before && !(item.done && item.evidence !== before.evidence))
    return say(
      `names "${cut(item.text)}", which main already has ticked; a later pull request names it only when it adds to that item's evidence`,
    );
  const current = [was, now].map((s) => currentSlice(s)?.n);
  if (item.owner === "Devesh" || current.includes(slice.n)) return [];
  const cur = current.find((c) => c !== undefined);
  return say(
    `names "${cut(item.text)}", an item of Slice ${n}, but ${cur === undefined ? "no slice can be built now" : `agents build only the current slice, Slice ${cur}`}; a replan moves the item into it first`,
  );
}
