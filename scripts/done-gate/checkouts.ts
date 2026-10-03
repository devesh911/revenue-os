// Which checkouts a session worked in, the state it found each in, and which of them a stop answers for.

import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { git } from "./git";
import type { HookInput } from "./hook-io";
import { gitOf, into, program, simpleCommands } from "./shell-words";
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
/** The checkout (of `all`) that holds `path`: the deepest, as a worktree may sit inside the main checkout's folder. */
const holding = (all: string[], path: string) => {
  let dir = path;
  while (!existsSync(dir) && dir !== dirname(dir)) dir = dirname(dir); // a file about to be created
  const at = real(dir);
  return all
    .filter((c) => at === c || at.startsWith(`${c}/`))
    .sort((a, b) => b.length - a.length)[0];
};

/**
 * The checkouts a shell command runs a program in: the one it starts in (`cwd`) until a `cd` or `pushd` moves it,
 * and one `git -C` names. A checkout it only names (a path given to `cat` or `diff`) is not one it runs in.
 */
export function ranIn(repo: string, cwd: string, command: string) {
  const all = checkoutsOf(repo);
  const at = (dir: string) =>
    resolve(cwd, dir.replace(/^~(?=\/|$)/, homedir()));
  const found = new Set<string>();
  let dir = "";
  for (const words of simpleCommands(command)) {
    const w = program(words);
    if (!w.length) continue;
    if (w[0] === "cd" || w[0] === "pushd") {
      dir = into(dir, w[1] ?? "~");
      continue;
    }
    const named = gitOf(words)?.dirs ?? [];
    for (const d of named.length ? named.map((c) => into(dir, c)) : [dir]) {
      const root = holding(all, at(d));
      if (root) found.add(root);
    }
  }
  return [...found];
}

/** What a checkout holds beyond its HEAD commit (edits, new files) as one id, which a pull or a switch keeps. */
export const extra = (root: string, tree: string) =>
  Bun.hash(git(root, ["diff-tree", "-r", "HEAD", tree], {}, true)).toString(36);

/** The record of the code the session last accepted on the branch a checkout is on; none when it is on no branch. */
const onBranch = (session: string, root: string) => {
  const branch = git(
    root,
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
    {},
    true,
  );
  return branch && `${session}-${Bun.hash(branch).toString(36)}`;
};
/**
 * The code the session accepts in a checkout: as it found it, as main's commits arriving left it, or as a stop judged
 * it. It is kept by branch too, so a worktree on that branch removed and added again, or moved, is judged from there.
 */
export function accept(
  store: Store,
  session: string,
  root: string,
  tree: string,
) {
  store.put("accepted", keyOf(session, root), tree);
  const branch = onBranch(session, root);
  if (branch) store.put("accepted-branch", branch, tree);
}

/**
 * Before a tool call, note each checkout the session is about to work in, and that it is the last to work there:
 * the checkout of its folder, of a file it edits, one a command enters (`cd`, `git -C`) or names by path. The
 * state a checkout is found in (the first time, or after another session worked there) is the baseline: only
 * what changes after it can be this session's, and on a branch the session accepted elsewhere, what changed since.
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
    const deepest = holding(all, resolve(cwd, p));
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
    const toucher = store.get("toucher", idOf(c));
    if (!same || toucher !== session) {
      const tree = snapshot(c, false).tree;
      // A checkout new to the session, on a branch it accepted elsewhere (a worktree it removed and added again, or
      // moved): what changed on that branch since is still its own, unless another session worked here last.
      const branch = onBranch(session, c);
      const before =
        !same && (!toucher || toucher === session) && branch
          ? store.get("accepted-branch", branch)
          : undefined;
      accept(store, session, c, before ?? tree);
      store.put("extra", key, extra(c, tree));
      if (!same) store.put("baseline", key, tree);
      store.put("seen", key, identity(c));
    }
    store.put("toucher", idOf(c), session);
  }
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
