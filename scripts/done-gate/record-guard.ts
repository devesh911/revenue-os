// The done gate's own record (.git/done-gate) and its hook are the gate's alone. Before a tool call, a command or
// edit that touches the record, or a command that runs the gate's hook by hand, is refused, and the refusal's first
// line reaches Devesh. Each simple command is read for the paths it is handed, in the folder it runs in: what it
// prints or searches for, a message, a pull request's words or a ruling's note are text, not paths, unless the line
// hands text on to be run (xargs, a shell reading its input). This reads what a careless or hurried agent would
// write, not what one set on forging "done" would (AGENTS.md → Definition of done): code that builds the path from
// pieces, a script file written first and run later, or a folder known only when the command runs still get through.

import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { HookInput } from "./hook-io";
import { gitOf, positionals, program, simpleCommands } from "./shell-words";

const TOLD = "Devesh is told of every such try.";
const RECORD = `it touches the done gate's own record (.git/done-gate), where the gate keeps what it has proven; only the gate itself reads or writes it, and a change there could fake a passed check or a verifier's ruling. ${TOLD}`;
const HOOK = `it runs the done gate's hook by hand; only Claude Code and Codex run it, before a tool call and at a stop. Check your work with \`bun run gate\`. ${TOLD}`;
const code = (name: string) =>
  `it hands code that names the done gate to \`${name}\`, which could write its record or run its hook out of this check's sight. Run \`bun run gate\` or the gate's tests instead. ${TOLD}`;

// The record named outright, `//` and `/./` included, or below a pattern or brace that can stand for the git
// folder's name (`.{git,}/done-gate`, `.g?t/done-gate`).
const NAMED = /\.git\/(?:\.?\/)*done-gate(?![\w.-])/;
const PATTERNED =
  /(?:^|[\s/'"`=:(])(?:\.[^\s/'"`]*[*?[{]|\{)[^\s/'"`]*\/+(?:\.\/+)*done-gate(?![\w.-])/;
// The record's name anywhere but in the gate's code (scripts/done-gate.ts and scripts/done-gate/).
const NAME = /(?<!scripts\/)done-gate(?![\w.-])/;
// A pattern or brace, which may stand for the record's name; `${…}` is a variable, not a brace.
const PATTERN = /[*?[]|(?<!\$)\{/;
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

// Text a command is handed, not a path: options whose value is text, by program (a message, a search, a pull
// request's words), a filter's pattern (`--exclude .git`, `-not -path './.git/*'`), and the search a grep is handed.
const TEXT_AFTER: Record<string, RegExp> = {
  git: /^(-[a-zA-Z]*m|--message|--grep)$/,
  gh: /^(-[bt]|--body|--title|--subject)$/,
};
const FILTERS =
  "exclude|exclude-dir|include|ignore|filter|path|ipath|name|iname|wholename|iwholename|regex|iregex|glob|iglob";
const FILTER = new RegExp(`^-{1,2}(?:${FILTERS})$`);
const TEXT_ATTACHED = new RegExp(
  `^-{1,2}(?:${FILTERS}|message|grep|body|title|subject)=`,
);
const SEARCHES = /^(grep|egrep|fgrep|rg|ag|ack)$/;
const SEARCH_VALUED = [
  "-e",
  "--regexp",
  "-f",
  "--file",
  "-m",
  "-A",
  "-B",
  "-C",
];

/**
 * The simple commands a line runs, in order, from the program each runs on, and those a shell's -c or eval is
 * handed, which follow it in place of its script.
 */
function runs(line: string, depth = 0): string[][] {
  return simpleCommands(line).flatMap((words) => {
    const w = program(words);
    const c = SHELL.test(w[0] ?? "")
      ? w.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a))
      : -1;
    const script =
      c > 0 ? w[c + 1] : w[0] === "eval" ? w.slice(1).join(" ") : undefined;
    if (!script || depth >= 3) return [w];
    const shell = c > 0 ? w.filter((_, k) => k !== c + 1) : w.slice(0, 1);
    return [shell, ...runs(script, depth + 1)];
  });
}

/** Does a simple command write its output to a file (`> f`, `>> f`, `2> f`), not to another output or /dev/null? */
const writes = (w: string[]) =>
  w.some((a, i) => {
    const to = a.match(/^\d*>>?\|?(.*)$/s);
    return !!to && !/^&\d*-?$|^\/dev\/null$/.test(to[1] || w[i + 1] || "");
  });

// Code handed to an interpreter inline: `-c`, `-e`, `--eval` …
const INLINE = /^-[a-zA-Z]*[ceEpr]$|^--(eval|print)\b/;

/** Does a simple command run text it reads (xargs, `read`, a shell or interpreter reading its input)? */
const runsWhatItReads = ([name = "", ...args]: string[]) =>
  /^(xargs|parallel|read|mapfile|readarray)$/.test(name) ||
  ((SHELL.test(name) || CODE.test(name)) &&
    !args.some((a) => INLINE.test(a)) &&
    /^(-|\/dev\/stdin)?$/.test(positionals(args)[0] ?? ""));

/**
 * The words of simple command `w` that may name a path: its redirections, and its arguments that are not text
 * (all of them when the line hands text on to be run, `handsOn`).
 */
function pathWords(w: string[], handsOn: boolean): string[] {
  const redirect = (k: number) =>
    (/^\d*[<>]/.test(w[k] ?? "") && w[k] !== "<<<") ||
    (/^\d*[<>]+&?$/.test(w[k - 1] ?? "") && w[k - 1] !== "<<<");
  if (handsOn) return w.slice(1);
  const words = w.filter((_, k) => !redirect(k));
  const [name = "", ...args] = words;
  const text = new Set<number>(); // indexes into args
  // A search's pattern (grep's, or git grep's after `grep`): each -e it is handed, or else the first word no option owns.
  const search = SEARCHES.test(name)
    ? 0
    : gitOf(words)?.sub === "grep"
      ? args.indexOf("grep") + 1
      : -1;
  const rest = search < 0 ? [] : args.slice(search);
  const E = /^(-e|--regexp)$/;
  const first = positionals(rest, SEARCH_VALUED)[0];
  const pattern =
    first === undefined || rest.some((a) => E.test(a))
      ? -1
      : search + rest.indexOf(first);
  const after = TEXT_AFTER[name];
  args.forEach((a, k) => {
    const before = args[k - 1] ?? "";
    if (
      /^(echo|printf)$/.test(name) ||
      TEXT_ATTACHED.test(a) ||
      after?.test(before) ||
      (FILTER.test(before) && !(name === "find" && changes(words))) ||
      (search >= 0 && k > search && E.test(before)) ||
      k === pattern
    )
      text.add(k);
  });
  // A ruling's note or a question for Devesh, handed to the gate's own command.
  const gate = positionals(args).filter((a) => !/^run(-script)?$/.test(a));
  if (
    name === "bun" &&
    (gate[0] === "gate" || ENTRY.test(gate[0] ?? "")) &&
    /^(verdict|pause)$/.test(gate[1] ?? "")
  )
    args.forEach((_, k) => {
      if (k > args.indexOf(gate[1] ?? "")) text.add(k);
    });
  return [
    ...args.filter((_, k) => !text.has(k)),
    ...w.filter((_, k) => redirect(k)),
  ];
}

/**
 * How a line names a git folder in a word: `.git` as a part of a path, git's ways of printing one (`$(git rev-parse
 * --git-common-dir)`), `$GIT_DIR`, or a variable the line sets to one of those (`D=$(git rev-parse --git-dir)`, then
 * `$D`). `itself`: the word is the git folder; `inside`: what the word names inside it (`--git-path x` names x).
 */
function gitFolder(said: string) {
  const vars = [
    ...said.matchAll(
      /(?:^|[\s;&|(])([A-Za-z_]\w*)=[^;&|\n]*?(?:(?:^|[\s/'"=(])\.git(?![\w-])|--(?:git-common-dir|git-dir|absolute-git-dir)\b)/g,
    ),
  ].map(([, v]) => `|${v}`);
  const printed = String.raw`--(?:git-common-dir|git-dir|absolute-git-dir)[)\x60]|\$\{?(?:GIT_(?:COMMON_)?DIR${vars.join("")})\}?`;
  const itself = new RegExp(String.raw`(?:(?:^|/)\.git|${printed})/?$`);
  const below = new RegExp(
    String.raw`(?:(?:^|[^\w.-])\.git[)'"\x60]*|${printed})/(.*)`,
    "s",
  );
  return {
    itself: (word: string) => itself.test(word),
    inside: (words: string[], k: number) => {
      const a = words[k] ?? "";
      if (a === "--git-path") return words[k + 1];
      return a.startsWith("--git-path=") ? a.slice(11) : a.match(below)?.[1];
    },
  };
}

/** Does a path inside the git folder reach where the record sits with a pattern: first, or after `..` climbs back? */
const patternAtTop = (inside: string) => {
  let depth = 0;
  for (const part of inside.split("/")) {
    if (depth <= 0 && PATTERN.test(part)) return true;
    depth += part === ".." ? -1 : part && part !== "." ? 1 : 0;
  }
  return false;
};

/** Is `dir` a git folder or inside one, links followed? */
const inGitFolder = (dir: string) => {
  const git = (p: string) => /(^|\/)\.git(\/|$)/.test(p);
  try {
    return git(dir) || git(realpathSync(dir));
  } catch {
    return git(dir);
  }
};

/**
 * Does simple command `w`, run in `dir` (undefined: known only when it runs), inside a git folder or not, touch the
 * record? Inside one: a program that is not a plain reader, or the record's name. Anywhere, in the words that may be
 * paths: the record named outright; a path inside a git folder that names the record's name, or reaches where it
 * sits with a pattern for a program that is not a plain reader; the git folder itself, or a pattern that can stand
 * for it, handed to a program that is not a reader (`rm -rf .git`, `rm -rf .*`); and, for a program that deletes,
 * moves, copies or links, the record's name in a path that lands in the record, links followed, or could (`find .
 * -name done-gate -delete`, `rm -rf "$D/done-gate"`).
 */
function touches(
  w: string[],
  dir: string | undefined,
  inGit: boolean,
  git: ReturnType<typeof gitFolder>,
  handsOn: boolean,
) {
  const name = w[0] ?? "";
  const paths = pathWords(w, handsOn);
  const reads = READS.has(name) || (name === "find" && !changes(w));
  const plain = reads && !writes(w);
  const named = paths.some((a) => NAME.test(a));
  if (
    (inGit && (!plain || named)) ||
    paths.some((a) => NAMED.test(a) || PATTERNED.test(a))
  )
    return true;
  const reaches = (path: string) =>
    name === "find" ||
    /[$`*?[{]/.test(path) ||
    (dir === undefined && !/^[/~]/.test(path)) ||
    editTouches(path, dir ?? "/");
  return paths.some((a, k) => {
    const inside = git.inside(paths, k);
    return (
      (inside !== undefined &&
        (NAME.test(inside) || (!plain && patternAtTop(inside)))) ||
      (!reads && (git.itself(a) || patternForGit(a, dir))) ||
      (changes(w) && NAME.test(a) && reaches(a))
    );
  });
}

/** Can a word's last part, a pattern, stand for a `.git` in its folder (`rm -rf .*`, `.g?t`, `.{git,}`)? */
function patternForGit(word: string, dir: string | undefined) {
  const parts = word.replace(/\/+$/, "").split("/");
  const last = parts.pop() ?? "";
  // A pattern starting with *, ? or [ never matches a name starting with a dot, as shells expand it.
  if (!PATTERN.test(last) || /^[*?[]/.test(last)) return false;
  const glob = last
    .replace(/[.+^$()|\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
    .replace(/\[!/g, "[^")
    .replace(
      /\{([^}]*)\}/g,
      (_, alts: string) => `(?:${alts.replaceAll(",", "|")})`,
    );
  let matches = true; // a pattern this can't read may match
  try {
    matches = new RegExp(`^${glob}$`).test(".git");
  } catch {}
  const folder = (parts.join("/") || ".").replace(/^~(?=\/|$)/, homedir());
  return (
    matches &&
    (dir === undefined ||
      /[$`*?[{]/.test(folder) ||
      existsSync(join(resolve(dir, folder), ".git")))
  );
}

/** Does `bun <the gate's entry> hook` (or `bun run gate hook`) run here? `$`: the entry may sit in a variable. */
const byHand = (w: string[], entryNamed: boolean) => {
  if (READS.has(w[0] ?? "")) return false; // printed or searched for, not run
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

/** PURE but for the folders it looks up: why a shell command run in `cwd` may not run here. */
function commandTouches(line: string, cwd: string): string | undefined {
  if (line.length > MAX_LINE) return;
  const all = runs(line);
  const said = [line, ...all.flat()].join("\n"); // its text, and each word read from it with quotes removed
  // Text the line hands on to be run may name the record anywhere: a heredoc's body, what echo prints into xargs.
  const handsOn = all.some(runsWhatItReads);
  if (handsOn && (NAMED.test(said) || PATTERNED.test(said))) return RECORD;
  // Each command in turn, in the folder it runs in: inside a git folder from the start, or after a `cd` into one.
  const git = gitFolder(said);
  let dir: string | undefined = cwd;
  let inGit = inGitFolder(cwd);
  for (const w of all) {
    if (touches(w, dir, inGit, git, handsOn)) return RECORD;
    if (!/^(cd|pushd|popd)$/.test(w[0] ?? "")) continue;
    const to = w[0] === "popd" ? "-" : (positionals(w.slice(1))[0] ?? "~");
    const known = !/^-$|[$`*?[{]/.test(to);
    dir =
      known && dir !== undefined
        ? resolve(dir, to.replace(/^~(?=\/|$)/, homedir()))
        : undefined;
    inGit =
      git.itself(to) ||
      git.inside([to], 0) !== undefined ||
      (dir !== undefined && inGitFolder(dir));
  }
  const entryNamed = /done-gate\.ts/.test(said);
  if (all.some((w) => byHand(w, entryNamed))) return HOOK;
  // Code handed to an interpreter inline (-e, -c, eval) that names the gate, or on its input (`-`) in a line that does.
  for (const [name = "", ...args] of all) {
    if (!CODE.test(name)) continue;
    const inline = args.some((a) => INLINE.test(a));
    const input = /^(eval|-)$/.test(positionals(args)[0] ?? "");
    if (
      (inline && /done-gate/.test(args.join("\n"))) ||
      (input && /done-gate/.test(said))
    )
      return code(name);
  }
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
