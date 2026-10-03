// Test helpers and fixtures inside product folders: a file the change adds under apps/, services/ or packages/
// counts as product code only when a file other than a test, a Markdown page, the gate itself or another such file
// names it, in quotes after a "/" or a quote, as an import or a path writes it: its whole name, its name without
// its last extension (with or without a .js or .ts one), or, for an index file, its folder's name. Anything else
// the change adds there (a testing/ or __fixtures__/ folder under src/) only tests use: it is a helper or fixture,
// and it comes along to main's code like the tests themselves (tests-proven.ts). A file some other file happens
// to quote by the same name counts as product code: a leniency, never a false refusal.

import { git } from "./git";
import { isProduct, TEST } from "./rules";
import type { Snap } from "./snapshot";

const NO_ATTRIBUTES = "--attr-source=4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The files the change adds under apps/, services/ or packages/ that only tests (or other such files) name. */
export function testOnly(snap: Snap): Set<string> {
  const onMain = new Set(
    git(
      snap.repo,
      ["ls-tree", "-r", "-z", "--name-only", snap.from, "--", ...snap.files],
      {},
      true,
    ).split("\0"),
  );
  const fresh = snap.files.filter(
    (f) =>
      isProduct(f) && /^(apps|services|packages)\//.test(f) && !onMain.has(f),
  );
  const namers = new Map(
    fresh.map((f) => {
      const parts = f.split("/");
      const name = parts.at(-1) ?? "";
      const stem = name.replace(/\.[^.]*$/, "");
      const stems = stem === "index" ? [stem, parts.at(-2) ?? ""] : [stem];
      const named = `[/"'\`](${escaped(name)}|(${stems.map(escaped).join("|")})(\\.[cm]?[jt]sx?)?)["'\`]`;
      return [
        f,
        git(
          snap.repo,
          [NO_ATTRIBUTES, "grep", "-lIz", "-E", "-e", named, snap.tree],
          {},
          true,
        )
          .split("\0")
          .map((l) => l.slice(snap.tree.length + 1)) // "<tree>:<path>"
          .filter(
            (g) =>
              g &&
              g !== f &&
              !TEST.test(g) &&
              !/\.md$/i.test(g) &&
              !g.startsWith("scripts/done-gate"),
          ),
      ] as const;
    }),
  );
  // Until nothing changes: a file named by one that is not (or no longer) a helper or fixture is product code.
  const only = new Set(fresh);
  for (let changed = true; changed; ) {
    changed = false;
    for (const f of only)
      if (namers.get(f)?.some((g) => !only.has(g))) {
        only.delete(f);
        changed = true;
      }
  }
  return only;
}
