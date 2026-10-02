// What agents' own tools may not do, asked by the Claude Code and Codex hooks before every shell command. This file
// reads each command for the program it really runs (past keywords and wrappers, inside substitutions, and in
// what a shell, eval or script is handed), refuses a command it can't read in a line that names something it
// guards, and refuses the cloud database pushes; secrets.ts judges secrets and github.ts GitHub. Claude Code's own
// settings deny the database pushes, the login reads and .env files too.

import { homedir } from "node:os";
import { resolve } from "node:path";
import { git } from "./git";
import { githubRefusal } from "./github";
import type { HookInput } from "./hook-io";
import { envFileUnder, loginRefusal, secretRefusal } from "./secrets";
import {
  into,
  positionals,
  program,
  readings,
  unredirected,
} from "./shell-words";

/** What the check may look up about a folder a command reaches ("" is where the command starts). */
const MAX_LINE = 64 * 1024; // reading takes longer the longer the line; agents' commands are far shorter

export type Look = {
  /** The branch the checkout there is on. */
  branchOf: (dir: string) => string | undefined;
  /** A .env file somewhere under it. */
  envFileIn: (dir: string) => string | undefined;
};

// Words that make a command line worth reading closely: GitHub, the cloud database, a secret or a login.
const SENSITIVE =
  /\bgh\b|\bsupabase\b|\.env(?!\.example\b)|github\.com|credential|\bsecurity\b|hosts\.yml|\.netrc|\.git-credentials/;
const SHELL = /^(sh|bash|zsh|dash|ksh|fish|tcsh|csh)$/;
const CODE = /^(python[\d.]*|node|bun|deno|ruby|perl|php|osascript)$/; // each takes code inline (-c, -e, -r)
// Programs that run commands they are handed (find with -exec), and xargs's options that take a value.
const RUNNERS = /^(xargs|watch|parallel|find|script)$/;
const XARGS_VALUE = ["-I", "-n", "-L", "-P", "-s", "-d", "-E", "-a"];

const CLOUD =
  "it reaches the cloud database (`supabase db push`, `supabase migration repair`, `supabase link`, or a reset or migration of the linked database). Migrations reach the cloud test database only through CI, after a merge (AGENTS.md hard rail 2).";

/** PURE: a shell command line → why agents may not run it, or nothing when they may. */
export function toolRefusal(command: string, look: Look): string | undefined {
  if (command.length > MAX_LINE)
    return `it is ${Math.round(command.length / 1024)} KB long, more than this check reads (64 KB); put long text in a file and pass the file.`;
  return judge(command, look, command);
}

/** Judges each simple command of `line`, in each way shells read it; `text` is the whole command line, where a guarded word is looked for. */
function judge(line: string, look: Look, text: string): string | undefined {
  for (const commands of readings(line)) {
    let dir = "";
    for (const words of commands) {
      const w = unredirected(program(words));
      const why =
        hidden(w, look, text) ??
        secretRefusal(words, w, dir, look.envFileIn) ??
        loginRefusal(w) ??
        cloud(w) ??
        githubRefusal(w, dir, look.branchOf);
      if (why) return why;
      if (w[0] === "cd" || w[0] === "pushd") dir = into(dir, w[1] ?? "~");
    }
  }
}

/** Before a tool call: why the shell command it runs may not run. A Codex patch arrives as `command` too, but is text. */
export function commandRefusal(input: HookInput) {
  const tool = input.tool_input ?? {};
  if (input.tool_name === "apply_patch" || typeof tool.command !== "string")
    return;
  const at = (dir: string) =>
    resolve(input.cwd ?? process.cwd(), dir.replace(/^~(?=\/|$)/, homedir()));
  return toolRefusal(tool.command, {
    branchOf: (dir) =>
      git(at(dir), ["symbolic-ref", "--quiet", "--short", "HEAD"], {}, true) ||
      undefined,
    envFileIn: (dir) => envFileUnder(at(dir)),
  });
}

/**
 * A command whose program this check can't read is refused when the line names something it guards: a shell
 * reading its commands from its input, code handed to an interpreter, an awk program that runs commands, a git
 * alias or ssh command, a runner such as xargs, an alias, or a program named only when it runs. gh handed to a
 * shell's -c or eval is refused; anything else they are handed is judged as a command line.
 */
function hidden(w: string[], look: Look, text: string): string | undefined {
  const [name = "", ...args] = w;
  const mark = text.match(SENSITIVE)?.[0];
  const no = (how: string) =>
    `it runs ${how}, which hides what the command does from this check, in a command line that names \`${mark}\`. Run the program itself, named plainly${mark === "gh" ? " (gh filters its own JSON with --jq)" : ""}.`;
  const c = args.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a));
  const script =
    (SHELL.test(name) || name === "script") && c >= 0
      ? (args[c + 1] ?? "")
      : name === "eval"
        ? args.join(" ")
        : undefined;
  if (script !== undefined)
    return /\bgh\b/.test(script)
      ? no(`gh through \`${name === "eval" ? "eval" : `${name} -c`}\``)
      : judge(script, look, text);
  if (!mark) return;
  const operands = args.filter((a) => !/^-./.test(a));
  if (
    SHELL.test(name) &&
    (args.includes("-s") || /^(-|\/dev\/stdin)?$/.test(operands[0] ?? ""))
  )
    return no(`a shell that reads its commands from its input (\`${name}\`)`);
  if (
    CODE.test(name) &&
    (args.some((a) => /^-[a-zA-Z]*[ceEpr]$|^--(eval|print)\b/.test(a)) ||
      /^(eval|-)?$/.test(operands[0] ?? ""))
  )
    return no(`code handed to \`${name}\``);
  if (
    /^[gmn]?awk$/.test(name) &&
    /system\s*\(|\|/.test(positionals(args, ["-f", "-v", "-F"])[0] ?? "")
  )
    return no("an awk program that runs commands");
  if (
    name === "git" &&
    args.some(
      (a, k) =>
        /^alias\.[^=]*=\s*!|^core\.sshcommand(=|$)/i.test(a) ||
        (/^alias\./.test(a) && (args[k + 1] ?? "").startsWith("!")),
    )
  )
    return no("a git alias or ssh command");
  const runs =
    name === "xargs" ? (positionals(args, XARGS_VALUE)[0] ?? "") : "";
  if (
    RUNNERS.test(name) &&
    (name !== "find" ||
      args.some((a) => /^-(exec|execdir|ok|okdir)$/.test(a))) &&
    (SENSITIVE.test(args.join(" ")) || /[$`{}]/.test(runs))
  )
    return no(`\`${name}\`, which runs the commands it is handed`);
  if (name === "alias") return no("an alias");
  if (/[$`{}*?[]/.test(name) && !/^\[\[?$/.test(name))
    return no(`a program named only when it runs (\`${name}\`)`);
}

function cloud(w: string[]) {
  if (w[0] !== "supabase") return;
  const args = w.slice(1);
  const [a = "", b = ""] = positionals(args, [
    "--workdir",
    "--profile",
    "--db-url",
    "-p",
    "--password",
    "--project-ref",
    "-o",
    "--output",
  ]);
  const linked = args.some((x) => /^--(linked|db-url)\b/.test(x));
  if (
    ["db push", "migration repair"].includes(`${a} ${b}`) ||
    a === "link" ||
    (linked && /^(db reset|migration (up|down))$/.test(`${a} ${b}`))
  )
    return CLOUD;
}
