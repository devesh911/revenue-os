// Test helpers and fixtures inside product folders: a file the change adds under apps/, services/ or packages/
// counts as product code only when a file other than a test, a Markdown page or another such file names it, by its
// name as an import or a path writes it ("./sample-phones", "phones.json", "./testing" for testing/index.ts).
// Anything else the change adds there (src/testing/, src/__fixtures__/) only tests use: it is a helper or fixture,
// and it comes along to main's code like the tests themselves (tests-proven.ts).

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
      const stem = (parts.at(-1) ?? "").split(".")[0] ?? "";
      const names = stem === "index" ? [stem, parts.at(-2) ?? ""] : [stem];
      const named = `[/"'\`](${names.map(escaped).join("|")})(\\.[A-Za-z0-9]+)*["'\`]`;
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
          .filter((g) => g && g !== f && !TEST.test(g) && !/\.md$/i.test(g)),
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
