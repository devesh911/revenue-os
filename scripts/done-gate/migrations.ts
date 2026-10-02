// Migrations on main never change (AGENTS.md hard rail 4): a change may add a migration, never edit, rename or
// delete one main already has, nor give a new one a number another migration has, nor number it to run before one
// main has (the cloud test database would run it last, while every local database and test runs it in file order).

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
 * The change's problems with migrations: a file in the folder spelled in another letter case (a Mac reads it as a
 * migration, Linux doesn't); each migration main had where the change starts whose content the change alters (a link
 * to other SQL included) or whose file it removes (a rename is a removal plus a new file); and each new numbered
 * migration whose number, read as a person does (2 is 002), another migration in the change's code already has, or
 * whose file sorts before main's newest. The branch's code holds every migration main had when the branch last
 * caught up, and main's ruleset makes a branch catch up before it merges, which runs this check again.
 */
export function migrationProblems(snap: Snap): string[] {
  const touched = snap.files.filter((f) => f.toLowerCase().startsWith(DIR));
  if (!touched.length) return [];
  const problems = touched
    .filter((f) => !f.startsWith(DIR))
    .map(
      (f) =>
        `${f} is in a folder spelled differently from ${DIR}: a Mac reads it as a migration and Linux doesn't; put it in ${DIR}`,
    );
  const main = migrationsAt(snap.repo, snap.from);
  const now = migrationsAt(snap.repo, snap.tree);
  for (const [path, id] of main)
    if (now.get(path) !== id)
      problems.push(
        `${path} is already on main, and this change ${now.has(path) ? "edits" : "deletes or renames"} it: a migration on main never changes (AGENTS.md hard rail 4); put the change in a new migration instead`,
      );
  const number = (path: string) => path.match(NUMBERED)?.[1];
  const newest = [...main.keys()].filter(number).sort().at(-1);
  for (const path of now.keys()) {
    const n = number(path);
    if (!n || main.has(path)) continue;
    const twin = [...now.keys()].find(
      (p) => p !== path && Number(number(p)) === Number(n),
    );
    if (twin)
      problems.push(
        `${path} reuses migration number ${n}, which ${twin} already has: give it the next free number`,
      );
    else if (newest && path < newest)
      problems.push(
        `${path} sorts before ${newest}, which main already has, so the cloud test database would run it after that one while every local database and test runs it before: number it after ${newest.slice(DIR.length)}`,
      );
  }
  return problems;
}
