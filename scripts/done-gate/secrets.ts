// Secrets a command would read: a .env file it names or a pattern that could match one, a stored login (gh's,
// git's, .netrc), Devesh's GitHub login read out of git or the keychain, and a search through every file of a
// folder that holds a .env file.

import { type Dirent, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { gitOf, into, positionals } from "./shell-words";

export const LOGIN =
  "it reads or changes Devesh's GitHub login (`gh auth`, `git credential`, the macOS keychain), which agents never touch.";

// A file of secrets: a .env file, .envrc, and the stored logins of gh, git and .netrc. .env.example is the
// committed template, with the names and none of the values, so it is not one.
const SECRET =
  /(^|\/)(\.env(\.[^/]*)?|\.envrc|\.netrc|\.git-credentials|gh\/hosts\.ya?ml)$/;
const TEMPLATE = /(^|\/)\.env\.example$/;
const isEnvFile = (name: string) =>
  /^\.env(\..+)?$/.test(name) && name !== ".env.example";

/** A glob or brace pattern as a regular expression, its `*` matching a leading dot too (as git and rg read one). */
const globRegex = (glob: string) => {
  try {
    return new RegExp(
      `^${glob
        .replace(/[.+^$()|\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".")
        .replace(/\[!/g, "[^")
        .replace(
          /\{([^}]*)\}/g,
          (_, alts: string) => `(${alts.split(",").join("|")})`,
        )}$`,
    );
  } catch {
    return undefined; // not a pattern (a lone `[`)
  }
};
/** Does a pattern match every .env name, as `.env*` does? */
const coversEnv = (glob: string) =>
  [".env", ".env.local"].every((n) => globRegex(glob)?.test(n));

/** Does a path name a file of secrets, or is it a pattern (not wildcards alone) that could match a .env file? */
const secretPath = (path: string) => {
  if (TEMPLATE.test(path)) return false;
  if (SECRET.test(path)) return true;
  const base = path.replace(/^.*\//, "");
  return (
    /[*?[{]/.test(base) &&
    /[^*?]/.test(base) &&
    [".env", ".env.local", ".envrc"].some((n) => globRegex(base)?.test(n))
  );
};

// Search programs: their options that take a value, the switches that make them read every file of a folder (a
// recursive grep; rg and ag reading hidden and ignored files), the option that leaves files out, and how to leave
// .env files out.
const SEARCH = new Map([
  [
    "grep",
    {
      valued:
        "-e --regexp -f --file --include --exclude --exclude-dir -A -B -C -m --max-count -d -D --label",
      everyFile:
        /^(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive|--dereference-recursive|--directories=recurse)$/,
      exclude: /^--exclude$/,
      fix: "--exclude='.env*'",
    },
  ],
  [
    "rg",
    {
      valued:
        "-e --regexp -f --file -g --glob --iglob -t --type -T --type-not -A -B -C -m --max-count -j --threads -M --max-columns --max-depth -d --ignore-file -r --replace --sort --sortr --pre -E --encoding",
      everyFile:
        /^(-[a-zA-Z]*u[a-zA-Z]*|-\.|--hidden|--no-ignore\S*|--unrestricted)$/,
      exclude: /^(-g|--i?glob)$/, // a glob that starts with ! leaves files out
      fix: "-g '!.env*'",
    },
  ],
  [
    "ag",
    {
      valued:
        "-G --file-search-regex --ignore --ignore-dir -A -B -C -m --max-count --depth -g -p --path-to-ignore",
      everyFile: /^(-[a-zA-Z]*u[a-zA-Z]*|--unrestricted|--hidden)$/,
      exclude: /^--ignore$/,
      fix: "--ignore '.env*'",
    },
  ],
]);

/**
 * A search's reading: the words that are text or filters rather than files it reads (its pattern, the files it
 * leaves out), the folders it searches, whether it reads every file in them, and whether it leaves .env files out.
 */
function searchOf(w: string[]) {
  const kind = SEARCH.get((w[0] ?? "").replace(/^[ef](?=grep$)/, ""));
  if (!kind) return;
  const valued = kind.valued.split(" ");
  const text: string[] = [];
  const operands: string[] = [];
  let patterned = false; // the pattern came by -e or -f, so every operand is a file
  let everyFile = false;
  let leavesEnvOut = false;
  for (let k = 1; k < w.length; k++) {
    const a = w[k] ?? "";
    if (!/^-./.test(a)) {
      operands.push(a);
      continue;
    }
    if (kind.everyFile.test(a)) everyFile = true;
    // `--name=value`, `-Xvalue`, or an option followed by its value.
    const joined =
      a.match(/^(--[\w-]+)=(.*)$/s) ??
      (a.length > 2 && valued.includes(a.slice(0, 2))
        ? [a, a.slice(0, 2), a.slice(2)]
        : null);
    const name = joined?.[1] ?? a;
    const value = joined ? joined[2] : valued.includes(a) ? w[++k] : undefined;
    if (value === undefined) continue;
    if (/^(-e|--regexp|-f|--file)$/.test(name)) patterned = true;
    const out =
      kind.exclude.test(name) && (w[0] !== "rg" || value.startsWith("!"));
    if (out && coversEnv(value.replace(/^!/, ""))) leavesEnvOut = true;
    if (out || /^(-e|--regexp)$/.test(name)) text.push(value);
  }
  if (!patterned && operands.length) text.push(operands.shift() ?? "");
  return {
    text,
    folders: operands.length ? operands : ["."],
    everyFile,
    leavesEnvOut,
    fix: kind.fix,
  };
}

/**
 * PURE: what a simple command would read that holds secrets. `words` as written, `w` from its program on;
 * `envFileIn(dir)` finds a .env file under a folder, for a search through every file of one.
 */
export function secretRefusal(
  words: string[],
  w: string[],
  dir: string,
  envFileIn: (dir: string) => string | undefined,
) {
  const search = searchOf(w);
  for (const word of words) {
    // As a word, after `=`, `<`, `>` or `:`, or after a one-letter option (`-f.env`).
    const pieces = [
      ...word.split(/[=<>:]/),
      word.match(/^-[a-zA-Z](.+)$/)?.[1] ?? "",
    ];
    const path = pieces.find((p) => !search?.text.includes(p) && secretPath(p));
    if (path)
      return `it names \`${path}\`, a file of secrets that agents never read or write (AGENTS.md hard rail 1)${path.includes(".env") ? "; the committed template .env.example is fine" : ""}.`;
  }
  if (search?.everyFile && !search.leavesEnvOut)
    for (const folder of search.folders) {
      const found = envFileIn(into(dir, folder));
      if (found)
        return `it searches every file of \`${folder}\`, and \`${found}\` there holds secrets agents never read (AGENTS.md hard rail 1). Add \`${search.fix}\` to leave .env files out, or search a folder without one.`;
    }
}

/** PURE: a command that reads Devesh's GitHub login out of git or the macOS keychain. */
export function loginRefusal(w: string[]) {
  if (
    gitOf(w)?.sub?.startsWith("credential") ||
    (w[0] === "security" &&
      /^(find-(generic|internet)-password|dump-keychain)$/.test(
        positionals(w.slice(1))[0] ?? "",
      ))
  )
    return LOGIN;
}

/** The first .env file under a folder (.env.example aside), past node_modules and .git: its path from the folder. */
export function envFileUnder(root: string) {
  const queue = [root];
  for (let dir = queue.shift(); dir !== undefined; dir = queue.shift()) {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // gone, unreadable, or a file
    }
    const hit = entries.find((e) => !e.isDirectory() && isEnvFile(e.name));
    if (hit) return relative(root, join(dir, hit.name));
    for (const e of entries)
      if (e.isDirectory() && e.name !== "node_modules" && e.name !== ".git")
        queue.push(join(dir, e.name));
  }
}
