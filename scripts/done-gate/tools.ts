// What agents' own tools may not do: touch the cloud database, read a secret (a .env file, Devesh's GitHub login)
// or write to GitHub other than by the loop's own steps (AGENTS.md → The loop). The hooks of Claude Code and Codex
// ask it before every shell command; Claude Code's own settings deny the database pushes and .env files as well.

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { git } from "./git";
import type { HookInput } from "./hook-io";
import { gitOf, program, simpleCommands, unredirected } from "./shell-words";

// The loop's own GitHub steps, besides pushing its branch (AGENTS.md → The loop, steps 4 to 6), as `group command`.
const LOOP = new Set(
  [
    "pr create edit comment ready merge view list checks diff status",
    "run view list watch",
    "repo view",
    "ruleset list view check",
  ].flatMap((line) => {
    const [group, ...commands] = line.split(" ");
    return commands.map((c) => `${group} ${c}`);
  }),
);
const BRANCH = /^(refs\/heads\/)?(feat|fix|claude)\/./;
// A file of secrets: a .env file (or a pattern that may match one, .env*), and gh's and git's stored logins.
// .env.example is the committed template, with the names and none of the values, so naming it is fine.
const secret = (path: string) =>
  /(^|\/)(\.env([.*?[].*)?|\.git-credentials|gh\/hosts\.ya?ml)$/.test(path) &&
  !/(^|\/)\.env\.example$/.test(path);
const CODE = /^(python[\d.]*|node|bun|deno|ruby|perl|php|osascript)$/; // takes code inline (-c, -e)
const SHELL = /^(sh|bash|zsh|dash|ksh)$/;
const GITHUB = /\bgithub\.com\b/;
const mentionsGh = (s: string) => /\bgh\b/.test(s);
/** The words no option owns, in order; each option in `valued` owns the word after it. */
const positionals = (args: string[], valued: string[] = []) =>
  args.filter(
    (a, i) => !a.startsWith("-") && !valued.includes(args[i - 1] ?? ""),
  );
/** The folder `cd <to>` or `git -C <to>` moves to from `dir` ("" is where the command starts). */
const into = (dir: string, to: string) =>
  /^[/~]/.test(to) ? to : join(dir, to);

const CLOUD =
  "it reaches the cloud database (`supabase db push`, `supabase migration repair`, `supabase link`, or a reset or migration of the linked database). Migrations reach the cloud test database only through CI, after a merge (AGENTS.md hard rail 2).";
const LOGIN =
  "it reads or changes Devesh's GitHub login (`gh auth`, `git credential`, the macOS keychain), which agents never touch.";
const HIDDEN =
  "it runs gh through `sh -c`, `eval`, `xargs`, an alias or a shell reading its input, which hides what gh does from this check; run gh itself.";

/**
 * PURE: a shell command line → why agents may not run it, or nothing when they may. `branchOf(dir)` is the branch
 * the checkout at `dir` (relative to where the command starts; "" is there) is on, for a push that names none.
 */
export function toolRefusal(
  command: string,
  branchOf: (dir: string) => string | undefined,
): string | undefined {
  let dir = "";
  for (const words of simpleCommands(command)) {
    const w = program(words);
    const why =
      secretIn(words) ??
      hidden(w, command, branchOf) ??
      refusalOf(unredirected(w), dir, branchOf);
    if (why) return why;
    if (w[0] === "cd" || w[0] === "pushd") dir = into(dir, w[1] ?? "~");
  }
}

/** Before a tool call: why the shell command it runs may not run. A Codex patch arrives as `command` too, but is text. */
export function commandRefusal(input: HookInput) {
  const command = input.tool_input?.command;
  if (input.tool_name === "apply_patch" || typeof command !== "string") return;
  const cwd = input.cwd ?? process.cwd();
  return toolRefusal(
    command,
    (dir) =>
      git(
        resolve(cwd, dir.replace(/^~(?=\/|$)/, homedir())),
        ["symbolic-ref", "--quiet", "--short", "HEAD"],
        {},
        true,
      ) || undefined,
  );
}

/** A secret file a command names: as a word, after `=`, `<`, `>` or `:`, or quoted in inline code. A search's pattern is text. */
function secretIn(words: string[]) {
  const w = program(words);
  const pattern = /^([ef]?grep|rg|ag)$/.test(w[0] ?? "")
    ? positionals(w.slice(1), ["-f", "--file"])[0] // `-f <file>` reads patterns from a file
    : undefined;
  const code = CODE.test(w[0] ?? "");
  for (const word of words) {
    if (word === pattern) continue;
    const path = [
      ...word.split(/[=<>:,]/),
      ...(code
        ? [...word.matchAll(/["'`]([^"'`\s]*)["'`]/g)].map((m) => m[1] ?? "")
        : []),
    ].find(secret);
    if (path)
      return `it names \`${path}\`, a file of secrets that agents never read or write (AGENTS.md hard rail 1)${path.includes(".env") ? "; the committed template .env.example is fine" : ""}.`;
  }
}

/** gh behind a shell, eval, xargs or an alias is refused; anything else a shell or eval is handed is judged as a command. */
function hidden(
  w: string[],
  line: string,
  branchOf: (dir: string) => string | undefined,
) {
  const shell = SHELL.test(w[0] ?? "");
  const c = w.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a));
  const script =
    shell && c > 0
      ? (w[c + 1] ?? "")
      : w[0] === "eval"
        ? w.slice(1).join(" ")
        : undefined;
  // A shell given no script reads its commands from its input: a pipe or a heredoc, whose text is in the line.
  const fromInput =
    shell && c < 0 && !w.slice(1).some((a) => !a.startsWith("-"));
  if (
    (script !== undefined && mentionsGh(script)) ||
    ((w[0] === "xargs" || w[0] === "alias") && w.slice(1).some(mentionsGh)) ||
    (fromInput && mentionsGh(line))
  )
    return HIDDEN;
  return script === undefined ? undefined : toolRefusal(script, branchOf);
}

/** What a program may not do, by program: the cloud database, the login, a push, gh, and writes to GitHub. */
function refusalOf(
  w: string[],
  dir: string,
  branchOf: (dir: string) => string | undefined,
) {
  const [name = "", ...args] = w;
  const g = gitOf(w);
  if (name === "supabase") return cloud(args);
  if (
    name === "security" &&
    /^(find-(generic|internet)-password|dump-keychain)$/.test(
      positionals(args)[0] ?? "",
    )
  )
    return LOGIN;
  if (g?.sub?.startsWith("credential")) return LOGIN;
  if (g?.sub === "push")
    return push(g.args, () => branchOf(g.dirs.reduce(into, dir)));
  if (name === "gh") return gh(args);
  const write = webWrite(w);
  if (write)
    return `it sends GitHub a request that is not a GET (\`${write}\`). Agents write to GitHub only through the loop's own steps; curl, wget and fetch may send it only GET requests.`;
}

function cloud(args: string[]) {
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

/** A push goes through only for a feat/, fix/ or claude/ branch, to origin, with plain options. */
function push(args: string[], branch: () => string | undefined) {
  const no = (detail: string) =>
    `agents push only a feat/, fix/ or claude/ branch to origin, with no force, tags or deletes, and this push ${detail}.`;
  const option = args.find(
    (a) =>
      a.startsWith("-") &&
      !/^(-[uqvn46]+|--(set-upstream|quiet|verbose|dry-run|no-verify|progress|porcelain|atomic))$/.test(
        a,
      ),
  );
  if (option) return no(`uses \`${option}\``);
  const [remote = "origin", ...refs] = args.filter((a) => !a.startsWith("-"));
  if (remote !== "origin") return no(`goes to \`${remote}\`, not origin`);
  for (const ref of refs.length ? refs : ["HEAD"]) {
    const [src = "", dst = src] = ref.split(":");
    if (ref.startsWith("+")) return no(`forces \`${ref}\``);
    if (!src) return no(`deletes \`${dst}\``);
    const target = /^(HEAD|@)$/.test(dst) ? branch() : dst;
    if (!target)
      return no(
        "starts in a checkout on no branch, so it can't tell what it would push",
      );
    if (!BRANCH.test(target)) return no(`would reach \`${target}\``);
  }
}

/** gh goes through only for the loop's own steps and for gh api reads. */
function gh(args: string[]) {
  const [group = "", command = ""] = positionals(args, ["-R", "--repo"]);
  if (group === "auth") return LOGIN;
  if (group === "api") return api(args.slice(args.indexOf("api") + 1));
  if (!LOOP.has(`${group} ${command}`))
    return `\`${["gh", group, command].filter(Boolean).join(" ")}\` is not one of the loop's own GitHub steps. On GitHub, agents push their own branch and run gh pr create, edit, comment, ready, merge, view, list, checks, diff or status, gh run view, list or watch, gh repo view, gh ruleset list, view or check, and gh api to read; anything else there is Devesh's to do.`;
}

// gh api options that take a value; any other option is a switch.
const API_VALUE = [
  "-X",
  "--method",
  "-f",
  "--raw-field",
  "-F",
  "--field",
  "-H",
  "--header",
  "--input",
  "-q",
  "--jq",
  "-t",
  "--template",
  "--hostname",
  "-p",
  "--preview",
  "--cache",
];

/**
 * gh api reads: no method but GET and no fields (-f, -F, --field, --raw-field, which make it a POST) or --input.
 * GraphQL reads send their query as a field, so `gh api graphql` may send fields (variables included) when one is
 * an inline `query=`, none reads a file (`=@…`) and none holds a mutation.
 */
function api(args: string[]) {
  const no = (detail: string) =>
    `\`gh api\` may only read: no method but GET, and none of -f, -F, --field, --raw-field or --input, except \`gh api graphql -f query='…'\` with an inline query and no mutation; this call ${detail}.`;
  let method = "GET";
  const fields: string[] = [];
  const addresses: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    // `--name=value`, `-Xvalue`, or an option followed by its value.
    const joined =
      a.match(/^(--[\w-]+)=(.*)$/s) ?? a.match(/^(-[A-Za-z])(.+)$/s);
    const name = joined?.[1] ?? a;
    const value = joined
      ? joined[2]
      : API_VALUE.includes(a)
        ? args[++i]
        : undefined;
    if (!name.startsWith("-")) addresses.push(a);
    else if (joined && !API_VALUE.includes(name))
      return no(`has \`${a}\`, an option this check can't read`);
    else if (name === "-X" || name === "--method")
      method = (value ?? "").toUpperCase();
    else if (["-f", "--raw-field", "-F", "--field"].includes(name))
      fields.push(value ?? "");
    else if (name === "--input") return no("sends a file as its body");
  }
  if (method !== "GET") return no(`uses method ${method || "(none)"}`);
  if (addresses.length !== 1)
    return no(`names ${addresses.length} addresses, not one`);
  if (!fields.length) return;
  if (addresses[0] !== "graphql")
    return no("sends fields, which makes it a POST");
  if (fields.some((f) => /^[^=]*=@/.test(f)))
    return no("reads a field from a file");
  if (!fields.some((f) => f.startsWith("query=")))
    return no("sends no inline query");
  if (fields.some((f) => /\bmutation\b/i.test(f)))
    return no("sends a mutation, which writes");
}

/** The word that makes a curl, wget or inline fetch to GitHub something other than a GET, if one does. */
function webWrite(w: string[]) {
  const fetched = w.find(
    (a) =>
      /\bfetch\s*\(/.test(a) &&
      GITHUB.test(a) &&
      /\bmethod\s*:(?!\s*["'`]GET["'`])|\bbody\s*:/i.test(a),
  );
  if (fetched) return "fetch(…)";
  if ((w[0] !== "curl" && w[0] !== "wget") || !w.some((a) => GITHUB.test(a)))
    return;
  const curl = w[0] === "curl";
  return w.find((a, i) => {
    const method = a.match(
      curl ? /^(?:-[a-zA-Z]*X|--request)(.*)$/ : /^--method=?(.*)$/,
    );
    if (method) return (method[1] || w[i + 1] || "").toUpperCase() !== "GET";
    return curl
      ? /^--(data|json|form|upload-file)|^-[a-zA-Z]*[dFT]/.test(a)
      : /^--(post|body)-/.test(a);
  });
}
