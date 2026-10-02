// The exact code in a checkout (tracked and untracked files, minus ignored ones) as a tree id, with its diff
// from main and, for each export the diff adds, the files that use it.

import {
  copyFileSync,
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
} from "node:fs";
import { join } from "node:path";
import { exportsOf, statementAt, uncommented } from "./code-text";
import { type Added, parseDiff } from "./diff";
import { leadsTo, modulePath, STAR_FROM, usesExport } from "./export-users";
import { git } from "./git";
import { stateDir } from "./store";

export type Snap = {
  repo: string;
  tree: string;
  from: string; // the commit the change starts from: where it left the base (the tree itself when there is no diff)
  files: string[];
  added: Added[];
  removed: Added[];
  users: Map<string, string[]>;
};

/**
 * The exact code in the worktree (tracked + untracked, minus ignored) as a tree id, plus its diff from where
 * HEAD left `base`. Without a `base`, origin/main, or HEAD in a checkout that has none. With `head`, the code of
 * that commit instead, against where it left `base` (origin/main without one): read as data, never checked out.
 */
export function snapshot(
  repo: string,
  withDiff = true,
  base?: string,
  head?: string,
): Snap {
  if (head) {
    const tree = git(repo, ["rev-parse", "--verify", `${head}^{tree}`]);
    if (!withDiff) return NONE(repo, tree);
    const from = git(repo, ["merge-base", head, base ?? "origin/main"]);
    return analyse(
      repo,
      tree,
      from,
      git(repo, [...DIFF, from, head]),
      (args) =>
        git(repo, [...GREP, ...args, tree], {}, true)
          .split("\0")
          .filter(Boolean)
          .map((l) => l.slice(tree.length + 1)), // "<tree>:<path>"
      (f) => git(repo, ["cat-file", "blob", `${tree}:${f}`], {}, true),
    );
  }
  const index = join(stateDir(repo), `index-${process.pid}`);
  const real = git(repo, [
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    "index",
  ]);
  if (existsSync(real)) {
    copyFileSync(real, index); // reuse git's file-stat cache: `add -A` stays fast
    // With the index's own age, which tells git what to re-read: a same-size edit in the second it was written.
    const written = Math.floor(statSync(real).mtimeMs / 1000);
    utimesSync(index, written, written);
  }
  const env = { GIT_INDEX_FILE: index };
  try {
    git(repo, ["add", "-A"], env);
    const tree = git(repo, ["write-tree"], env);
    if (!withDiff) return NONE(repo, tree);
    const from = base
      ? git(repo, ["merge-base", "HEAD", base])
      : git(repo, ["merge-base", "HEAD", "origin/main"], {}, true) || "HEAD";
    return analyse(
      repo,
      tree,
      from,
      git(repo, [...DIFF, "--cached", from], env),
      (args) =>
        git(repo, [...GREP, "--cached", ...args], env, true)
          .split("\0")
          .filter(Boolean),
      (f) => {
        try {
          return readFileSync(join(repo, f), "utf8");
        } catch {
          return ""; // e.g. a symlink to a folder
        }
      },
    );
  } finally {
    rmSync(index, { force: true });
  }
}

const NONE = (repo: string, tree: string): Snap => ({
  repo,
  tree,
  from: tree,
  files: [],
  added: [],
  removed: [],
  users: new Map(),
});
// The change's own .gitattributes must not hide it (`*.ts -diff`, `binary`) nor run a program on it, so the
// attributes come from the empty tree, and no text conversion runs.
const NO_ATTRIBUTES = "--attr-source=4b825dc642cb6eb9a060e54bf8d69288fbee4904"; // the empty tree
const GREP = [NO_ATTRIBUTES, "-c", "core.quotePath=off", "grep", "-z"];
const DIFF = [
  NO_ATTRIBUTES,
  "-c",
  "core.quotePath=off",
  "diff",
  "--no-textconv",
  "--unified=0",
  "--no-color",
  "--no-renames",
  "--no-ext-diff",
];

/**
 * The diff's files and added lines, and for each export it adds, the files that use it. `grepIn(options)` runs
 * `git grep` with them over the code being judged and lists the files it names; `readFile` reads one of them.
 */
function analyse(
  repo: string,
  tree: string,
  from: string,
  diff: string,
  grepIn: (args: string[]) => string[],
  readFile: (f: string) => string,
): Snap {
  const { files, added, removed } = parseDiff(diff);
  const users = new Map<string, string[]>(); // "file name" → files using the export
  const texts = new Map<string, string>();
  const read = (f: string) => {
    if (!texts.has(f)) texts.set(f, readFile(f));
    return texts.get(f) ?? "";
  };
  // Files holding a string: only candidates, usesExport decides.
  const grep = (s: string, word = false) =>
    grepIn(["-lIF"].concat(word ? ["-w"] : []).concat(["-e", s]));
  let stars: [string, string[]][] | undefined; // files that `export * from`, and from where
  let namespaced: string[] | undefined; // files that may `import * as`
  for (const [i, { file }] of added.entries())
    for (const name of exportsOf(statementAt(added, i).code)) {
      if (users.has(`${file} ${name}`)) continue;
      stars ??= grep("export *").map((f) => [
        f,
        [...uncommented(read(f)).matchAll(STAR_FROM)].map((m) => m[1] ?? ""),
      ]);
      const reach = [file]; // file, then every barrel that re-exports it, however deep
      for (const to of reach)
        for (const [b, specs] of stars)
          if (!reach.includes(b) && specs.some((s) => leadsTo(s, b, to)))
            reach.push(b);
      namespaced ??= grep("* as");
      // A default export's importers name its module, or its package for a package's entry file.
      const words =
        name === "default"
          ? [
              modulePath(file).split("/").at(-1) ?? "",
              file.match(
                /^packages\/([^/]+)\/src\/index\.[cm]?[jt]sx?$/,
              )?.[1] ?? "",
            ].filter(Boolean)
          : [name];
      users.set(
        `${file} ${name}`,
        [
          ...new Set([...words.flatMap((w) => grep(w, true)), ...namespaced]),
        ].filter((f) => usesExport(read(f), f, file, name, reach.slice(1))),
      );
    }
  return { repo, tree, from, files, added, removed, users };
}
