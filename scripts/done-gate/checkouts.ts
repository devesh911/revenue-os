// Which checkouts a session worked in, the state it found each in, and which of them a stop answers for.

import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { git } from "./git";
import type { HookInput } from "./hook-io";
import { snapshot } from "./snapshot";
import type { Store } from "./store";

const real = (path: string) => {
  try {
    return path && realpathSync(path); // realpathSync("") would be the current folder
  } catch {
    return "";
  }
};
export const toplevel = (dir: string) =>
  real(git(dir, ["rev-parse", "--show-toplevel"], {}, true));
/** Every checkout of this repository: the main one first, then each worktree. */
export const checkoutsOf = (repo: string) =>
  git(repo, ["worktree", "list", "--porcelain"], {}, true)
    .split("\n")
    .filter((l) => l.startsWith("worktree "))
    .map((l) => real(l.slice(9)))
    .filter(Boolean);
export const keyOf = (session: string, root: string) =>
  `${session}-${Bun.hash(root).toString(36)}`;
export const idOf = (root: string) => Bun.hash(root).toString(36);
/**
 * Which checkout sits at `root`: a worktree removed and added again at the same path is another one. Linux reuses a
 * deleted file's inode number at once, so a worktree's `.git` file (a one-line pointer git never rewrites in normal
 * work) is also told apart by when it last changed; the main checkout's `.git` is a folder whose times change with
 * every git command, and is never removed and added again, so its inode number alone names it.
 */
export const identity = (root: string) => {
  try {
    const git = statSync(join(root, ".git"));
    return `${root}\n${git.ino}${git.isFile() ? `:${git.ctimeMs}` : ""}`;
  } catch {
    return root;
  }
};
/**
 * Did this session make the commit HEAD is on, in this checkout (a commit, amend, rebase, cherry-pick or merge
 * commit since it started)? Arriving at a commit by a switch, a reset or a fast-forward is not making it.
 */
export const madeHere = (root: string, started: number) => {
  const [at = "", ...how] = git(
    root,
    ["reflog", "show", "-1", "--date=unix", "--format=%gd %gs", "HEAD"],
    {},
    true,
  ).split(" ");
  return (
    Number(at.match(/\{(\d+)\}/)?.[1]) >= started &&
    !/^(checkout|reset): |: Fast-forward$/.test(how.join(" "))
  );
};
/** What a checkout holds beyond its HEAD commit (edits, new files) as one id, which a pull or a switch keeps. */
export const extra = (root: string, tree: string) =>
  Bun.hash(git(root, ["diff-tree", "-r", "HEAD", tree], {}, true)).toString(36);

/**
 * Before a tool call, note each checkout the session is about to work in, and that it is the last to work there:
 * the checkout of its folder, of a file it edits, one a command enters (`cd`, `git -C`) or names by path. The
 * state a checkout is found in (the first time, or after another session worked there) is the baseline: only
 * what changes after it can be this session's. Returns the checkouts it noted.
 */
export function touch(
  repo: string,
  input: HookInput,
  store: Store,
  session: string,
) {
  const all = checkoutsOf(repo);
  const cwd = input.cwd ?? repo;
  const tool = input.tool_input ?? {};
  const command = typeof tool.command === "string" ? tool.command : "";
  const entered = [
    ...command.matchAll(/(?:\bcd|\s-C)\s+("[^"]+"|'[^']+'|[^\s;&|)]+)/g),
  ].map(([, p = ""]) =>
    p
      .replace(/^["']|["']$/g, "")
      .replace(/^~(?=\/|$)/, process.env.HOME ?? "~"),
  );
  const hits = new Set<string>();
  for (const p of [cwd, tool.file_path, tool.notebook_path, ...entered]) {
    if (typeof p !== "string" || !p) continue;
    let dir = resolve(cwd, p);
    while (!existsSync(dir) && dir !== dirname(dir)) dir = dirname(dir); // a file about to be created
    const path = real(dir);
    const deepest = all // a worktree may sit inside the main checkout's folder
      .filter((c) => path === c || path.startsWith(`${c}/`))
      .sort((a, b) => b.length - a.length)[0];
    if (deepest) hits.add(deepest);
  }
  let named = command;
  for (const c of [...all].sort((a, b) => b.length - a.length))
    for (const form of [
      c,
      c.replace(/^\/private(?=\/)/, ""),
      relative(all[0] ?? c, c),
    ])
      if (form && named.includes(form)) {
        hits.add(c);
        named = named.split(form).join(" "); // else the main checkout's path, a prefix of a worktree's, matches too
      }
  for (const c of hits) {
    const key = keyOf(session, c);
    const same = store.get("seen", key) === identity(c);
    if (!same || store.get("toucher", idOf(c)) !== session) {
      const tree = snapshot(c, false).tree;
      store.put("accepted", key, tree);
      store.put("extra", key, extra(c, tree));
      if (!same) store.put("baseline", key, tree);
      store.put("seen", key, identity(c));
    }
    store.put("toucher", idOf(c), session);
  }
  if (!store.get("started", session))
    store.put("started", session, String(Math.floor(Date.now() / 1000)));
  return [...hits];
}

/** The checkouts a stop answers for: those the session noted, and the one its shell is in. */
export function rootsOf(
  repo: string,
  store: Store,
  session: string,
  cwd?: string,
) {
  const here = toplevel(cwd ?? repo);
  const all = checkoutsOf(repo);
  return {
    all,
    here,
    roots: [
      ...new Set([
        ...store
          .list("seen", `${session}-`)
          .map(({ key }) => store.get("seen", key) ?? "")
          .filter((seen) => seen === identity(seen.split("\n")[0] ?? "")) // still the checkout it saw
          .map((seen) => seen.split("\n")[0] ?? ""),
        ...(all.includes(here) ? [here] : []),
      ]),
    ].filter((r) => r && existsSync(r)),
  };
}
