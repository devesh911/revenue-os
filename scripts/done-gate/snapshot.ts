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
  files: string[];
  added: Added[];
  users: Map<string, string[]>;
};

/**
 * The exact code in the worktree (tracked + untracked, minus ignored) as a tree id, plus its diff from where
 * HEAD left `base`. Without a `base`, origin/main, or HEAD in a checkout that has none.
 */
export function snapshot(repo: string, withDiff = true, base?: string): Snap {
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
    if (!withDiff)
      return { repo, tree, files: [], added: [], users: new Map() };
    const from = base
      ? git(repo, ["merge-base", "HEAD", base])
      : git(repo, ["merge-base", "HEAD", "origin/main"], {}, true) || "HEAD";
    const diffArgs = [
      "-c",
      "core.quotePath=off",
      "diff",
      "--cached",
      "--unified=0",
      "--no-color",
      "--no-renames",
    ];
    const { files, added } = parseDiff(
      git(repo, [...diffArgs, "--no-ext-diff", from], env),
    );
    const users = new Map<string, string[]>(); // "file name" → files using the export
    const texts = new Map<string, string>();
    const read = (f: string) => {
      if (!texts.has(f))
        try {
          texts.set(f, readFileSync(join(repo, f), "utf8"));
        } catch {
          texts.set(f, ""); // e.g. a symlink to a folder
        }
      return texts.get(f) ?? "";
    };
    // Files holding a string: only candidates, usesExport decides.
    const grep = (s: string, word = false) =>
      git(
        repo,
        ["-c", "core.quotePath=off", "grep", "--cached", "-lIF"]
          .concat(word ? ["-w"] : [])
          .concat(["-e", s]),
        env,
        true,
      )
        .split("\n")
        .filter(Boolean);
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
    return { repo, tree, files, added, users };
  } finally {
    rmSync(index, { force: true });
  }
}
