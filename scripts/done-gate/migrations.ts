// Migrations on main never change (AGENTS.md hard rail 4): a change may add a migration, never edit, rename or
// delete one main already has, nor give a new one a number another migration has.

import { git } from "./git";
import type { Snap } from "./snapshot";

const DIR = "supabase/migrations/";
// The files `supabase db push` applies: `<number>_<name>.sql` directly in the folder, the number being the version.
const NUMBERED = /^supabase\/migrations\/(\d+)_[^/]*\.sql$/;

/** The .sql files directly in the migrations folder of a commit or tree, each with its content's id. */
const migrationsAt = (repo: string, treeish: string) =>
  new Map(
    git(repo, ["ls-tree", "-z", treeish, "--", DIR])
      .split("\0")
      .flatMap((entry) => {
        const m = entry.match(/^\d+ blob (\w+)\t(.+\.sql)$/s); // "<mode> blob <id>\t<path>"; a link is a blob too
        return m ? [[m[2] ?? "", m[1] ?? ""] as const] : [];
      }),
  );

/**
 * The change's problems with migrations: each one main had where the change starts whose content the change
 * alters (a link to other SQL included) or whose file it removes (a rename is a removal plus a new file), and each
 * new numbered migration whose number another migration in the change's code already has. The branch's code holds
 * every migration main had when the branch last caught up, and main's ruleset makes a branch catch up before it
 * merges, which runs this check again.
 */
export function migrationProblems(snap: Snap): string[] {
  if (!snap.files.some((f) => f.startsWith(DIR))) return [];
  const main = migrationsAt(snap.repo, snap.from);
  const now = migrationsAt(snap.repo, snap.tree);
  const problems = [...main]
    .filter(([path, id]) => now.get(path) !== id)
    .map(
      ([path]) =>
        `${path} is already on main, and this change ${now.has(path) ? "edits" : "deletes or renames"} it: a migration on main never changes (AGENTS.md hard rail 4); put the change in a new migration instead`,
    );
  const number = (path: string) => path.match(NUMBERED)?.[1];
  for (const path of now.keys()) {
    const n = number(path);
    const twin = [...now.keys()].find((p) => p !== path && number(p) === n);
    if (n && twin && !main.has(path))
      problems.push(
        `${path} reuses migration number ${n}, which ${twin} already has: give it the next free number`,
      );
  }
  return problems;
}
