// A pull request's body says on its first line what the pull request is: a roadmap item of ROADMAP.md as the pull
// request leaves it, a replan of a slice, Side-track work or off-roadmap work (AGENTS.md → The loop, step 4).

const FORMS =
  "`Roadmap: Slice N — <item>` (the item's text as ROADMAP.md has it, whole or up to its first colon, a note in brackets allowed after it), `Roadmap: Slice N — replan: <what>` (a pull request that changes ROADMAP.md), `Roadmap: Side track — <what>` or `Roadmap: off-roadmap — <what>`, each with an em dash (—)";
const LINE = /^Roadmap: (?:Slice (\d+)|Side track|off-roadmap) — (\S.*)$/;
const ITEM = /^- \[[ x]\] (.+?) \((?:agent|Devesh)\)(?: · evidence: .+)?\s*$/; // as docs/tracker/parse.js reads one

/** PURE: text as a branch description is matched (scripts/cycle.ts): no case, Markdown marks, quotes or extra spaces. */
const plain = (s: string) =>
  s
    .replace(/[`*_~"'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** PURE: ROADMAP.md → the items of Slice `n`, each named by its whole text and by its text up to its first colon. */
function namesIn(roadmap: string, n: number): string[] | undefined {
  const part = roadmap
    .replace(/\r\n?/g, "\n")
    .split(/^## /m)
    .find((p) => Number(p.match(/^Slice (\d+):/)?.[1] ?? -1) === n);
  return part
    ?.split("\n")
    .flatMap((l) => l.match(ITEM)?.[1] ?? [])
    .flatMap((text) => [text, text.split(/:\s/)[0] ?? ""].map(plain));
}

/**
 * PURE: the PR body, ROADMAP.md as the pull request leaves it, and whether the pull request changes it → what is
 * wrong with the body's first line, read exactly as written (no problem when it is one of the forms).
 */
export function firstLineProblems(
  body: string,
  roadmap: string,
  replans: boolean,
): string[] {
  const first = (body.split(/\r?\n/, 1)[0] ?? "").trimEnd();
  const m = first.match(LINE);
  const say = (what: string) => [`the PR body's first line ${what}: ${FORMS}`];
  if (!m)
    return say(
      `"${first.length > 100 ? `${first.slice(0, 99)}…` : first}" is not one of the forms AGENTS.md → The loop, step 4, gives`,
    );
  const [, n, what = ""] = m;
  if (n === undefined) return [];
  const names = namesIn(roadmap, Number(n));
  if (!names) return say(`names Slice ${n}, which ROADMAP.md does not have`);
  if (/^replan: \S/.test(what))
    return replans
      ? []
      : [
          `the PR body's first line says it replans Slice ${n}, but the pull request doesn't change ROADMAP.md: name the roadmap item it builds, the Side track or off-roadmap work instead`,
        ];
  const named = [what, what.replace(/\s*\([^()]*\)$/, "")].map(plain);
  return named.some((x) => names.includes(x))
    ? []
    : say(`names "${what}", which is no item of Slice ${n} in ROADMAP.md`);
}
