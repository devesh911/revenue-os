// The done gate's own record (.git/done-gate) and its hook are the gate's alone. Before a tool call, a command or
// edit that touches the record, or a command that runs the gate's hook by hand, is refused, and the refusal's first
// line reaches Devesh. This reads what a careless or hurried agent would write, not what one set on forging "done"
// would (AGENTS.md → Definition of done): code that builds the path from pieces, a script file written first and
// run later, a name spelt with a pattern in the git folder's own name (`.g?t/d*`), or a variable that holds the git
// folder and is used in a later command, all still get through.

import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { HookInput } from "./hook-io";
import { positionals, program, simpleCommands } from "./shell-words";

const TOLD = "Devesh is told of every such try.";
const RECORD = `it touches the done gate's own record (.git/done-gate), where the gate keeps what it has proven; only the gate itself reads or writes it, and a change there could fake a passed check or a verifier's ruling. ${TOLD}`;
const HOOK = `it runs the done gate's hook by hand; only Claude Code and Codex run it, before a tool call and at a stop. Check your work with \`bun run gate\`. ${TOLD}`;
const code = (name: string) =>
  `it hands code that names the done gate to \`${name}\`, which could write its record or run its hook out of this check's sight. Run \`bun run gate\` or the gate's tests instead. ${TOLD}`;

// The record named outright, `//` and `/./` included.
const NAMED = /\.git\/(?:\.?\/)*done-gate(?![\w.-])/;
// A git folder: `.git` as a part of a path, or git's ways of naming one.
const GIT_DIR =
  /(?:^|[\s'"`=:(/*?])\.git(?=$|[\s'"`;&|)/*?])|--(?:git-common-dir|git-dir|absolute-git-dir|git-path)\b|\bGIT_(?:COMMON_)?DIR\b/;
// The git folder itself as a whole word: `.git`, `x/.git/`, `$(git rev-parse --git-common-dir)`, `$GIT_DIR`.
const ITSELF =
  /(^|\/)\.git\/?$|--(?:git-common-dir|git-dir|absolute-git-dir)\)\/?$|^\$\{?GIT_(?:COMMON_)?DIR\}?\/?$/;
// The record's name anywhere but in the gate's code (scripts/done-gate.ts and scripts/done-gate/).
const NAME = /(?<!scripts\/)done-gate(?![\w.-])/;
// Programs that may be handed the git folder, or run inside it: they only read, print, or move the shell.
const READS = new Set(
  "cat less head tail wc du ls stat file readlink realpath dirname basename echo printf test [ [[ cd pushd popd pwd true false git grep rg diff cmp jq".split(
    " ",
  ),
);
// Programs that delete, move, copy or link what they are given (find only with -delete or -exec).
const CHANGES = new Set(
  "rm rmdir unlink mv ln cp rsync trash shred tar ditto".split(" "),
);
const changes = ([name = "", ...args]: string[]) =>
  CHANGES.has(name) ||
  (name === "find" &&
    args.some((a) => /^-(delete|exec|execdir|ok|okdir)$/.test(a)));
const SHELL = /^(sh|bash|zsh|dash|ksh|fish)$/;
const CODE = /^(python[\d.]*|node|bun|deno|ruby|perl|php|osascript)$/;
const ENTRY = /(^|\/)done-gate(\.ts)?$/;
const PATCH = /^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$/gm;
const MAX_LINE = 64 * 1024; // the command check (tools.ts) refuses a longer line

/** The simple commands a line runs, from the program each runs on, and those a shell's -c or eval is handed. */
function runs(line: string, depth = 0): string[][] {
  return simpleCommands(line).flatMap((words) => {
    const w = program(words);
    const c = SHELL.test(w[0] ?? "")
      ? w.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a))
      : -1;
    const script =
      c > 0 ? w[c + 1] : w[0] === "eval" ? w.slice(1).join(" ") : undefined;
    return [w, ...(script && depth < 3 ? runs(script, depth + 1) : [])];
  });
}

/** Does a simple command write its output to a file (`> f`, `>> f`, `2> f`), not to another output or /dev/null? */
const writes = (w: string[]) =>
  w.some((a, i) => {
    const to = a.match(/^\d*>>?\|?(.*)$/s);
    return !!to && !/^&\d*-?$|^\/dev\/null$/.test(to[1] || w[i + 1] || "");
  });

/** Does `bun <the gate's entry> hook` (or `bun run gate hook`) run here? `$`: the entry may sit in a variable. */
const byHand = (w: string[], entryNamed: boolean) => {
  const script = /^(bun|npm|pnpm|yarn)$/.test(w[0] ?? "")
    ? positionals(w.slice(1)).filter((a) => !/^run(-script)?$/.test(a))
    : [];
  return (
    (/^gates?$/.test(script[0] ?? "") && script[1] === "hook") ||
    w.some(
      (a, k) =>
        (ENTRY.test(a) || (entryNamed && a.includes("$"))) &&
        positionals(w.slice(k + 1))[0] === "hook",
    )
  );
};

/** PURE: why a shell command run in `cwd` may not run here: it touches the record, runs the hook or names the gate in code. */
function commandTouches(line: string, cwd: string): string | undefined {
  if (line.length > MAX_LINE) return;
  const all = runs(line);
  const said = [line, ...all.flat()].join("\n"); // its text, and each word read from it with quotes removed
  const inGit = /(^|\/)\.git(\/|$)/.test(cwd);
  // Refused: the record named outright; a git folder named with the record's name or a pattern; the git folder
  // itself handed to a program that is not a reader (`rm -rf .git`), or such a program or a write to a file run
  // inside it; the record's name with a program that deletes, moves, copies or links (`find . -name done-gate -delete`).
  if (
    NAMED.test(said) ||
    ((inGit || GIT_DIR.test(said)) &&
      (NAME.test(said) || /[*?[{]/.test(said))) ||
    all.some(
      (w) =>
        (!READS.has(w[0] ?? "") &&
          (inGit || w.slice(1).some((a) => ITSELF.test(a)))) ||
        (inGit && writes(w)),
    ) ||
    (NAME.test(said) && all.some(changes))
  )
    return RECORD;
  const entryNamed = /done-gate\.ts/.test(said);
  if (all.some((w) => byHand(w, entryNamed))) return HOOK;
  // Code handed to an interpreter inline (-e, -c, eval) or on its input (`-`).
  const inline = all.find(
    ([name = "", ...args]) =>
      CODE.test(name) &&
      (args.some((a) => /^-[a-zA-Z]*[ceEpr]$|^--(eval|print)\b/.test(a)) ||
        /^(eval|-)$/.test(positionals(args)[0] ?? "")),
  );
  if (inline && /done-gate/.test(said)) return code(inline[0] ?? "");
}

/** Does an edit of `path` (from `cwd`) write into the record, through a link too? */
function editTouches(path: string, cwd: string) {
  const full = resolve(cwd, path.replace(/^~(?=\/|$)/, homedir()));
  let dir = full;
  while (!existsSync(dir) && dir !== dirname(dir)) dir = dirname(dir); // a file about to be created
  const inRecord = (p: string) => /\/\.git\/done-gate(\/|$)/.test(p);
  return (
    inRecord(full) || inRecord(join(realpathSync(dir), full.slice(dir.length)))
  );
}

/** Before a tool call: why its command or edit may not touch the gate's record or run its hook, or nothing. */
export function recordRefusal(input: HookInput): string | undefined {
  const tool = input.tool_input ?? {};
  const cwd = input.cwd ?? process.cwd();
  const patch =
    input.tool_name === "apply_patch" && typeof tool.command === "string"
      ? tool.command
      : undefined;
  const paths = patch
    ? [...patch.matchAll(PATCH)].map(([, p = ""]) => p.trim())
    : [tool.file_path, tool.notebook_path];
  if (paths.some((p) => typeof p === "string" && p && editTouches(p, cwd)))
    return RECORD;
  if (!patch && typeof tool.command === "string")
    return commandTouches(tool.command, cwd);
}
