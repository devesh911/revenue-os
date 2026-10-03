// What agents may do on GitHub: push a feat/, fix/ or claude/ branch to origin, run the loop's own gh steps
// (AGENTS.md → The loop, steps 4 to 6) and gh api reads. Every other gh command, gh api write, and curl or wget
// request to GitHub that is not a GET is refused.

import { LOGIN } from "./secrets";
import { gitOf, into, positionals } from "./shell-words";

// The loop's own GitHub steps, besides pushing its branch, as `group command`.
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

/**
 * PURE: what a simple command (from its program on, without redirections) may not do on GitHub. `branchOf(dir)`
 * is the branch the checkout at `dir` is on, for a push that names none; `dir` is where the command runs.
 */
export function githubRefusal(
  w: string[],
  dir: string,
  branchOf: (dir: string) => string | undefined,
) {
  const g = gitOf(w);
  if (g?.sub === "push")
    return push(g.args, () => branchOf(g.dirs.reduce(into, dir)));
  if (w[0] === "gh") return gh(w.slice(1));
  const write = webWrite(w);
  if (write)
    return `it sends GitHub a request that is not a GET (\`${write}\`). Agents write to GitHub only through the loop's own steps; curl and wget may send it only GET requests.`;
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

/** gh goes through only for the loop's own steps and for gh api reads. Its own options come before the group. */
function gh(args: string[]) {
  const [group = "", command = ""] = positionals(args, [
    "-R",
    "--repo",
    "--hostname",
  ]);
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
 * GraphQL reads send their query as a field, so `gh api graphql` may send fields (variables included) when its
 * `query=` is written out inline (starting with `{` or `query`, with no `$(…)` or backquote to fill it in when it
 * runs), none reads a file (`=@…`) and none holds a mutation.
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
  const queries = fields
    .filter((f) => f.startsWith("query="))
    .map((f) => f.slice(6).trimStart());
  if (
    !queries.length ||
    queries.some((q) => !/^(\{|query\b)/.test(q) || /\$\(|`/.test(q))
  )
    return no(
      "sends no inline query (one written out in the command, starting with `{` or `query`)",
    );
  if (fields.some((f) => /\bmutation\b/i.test(f)))
    return no("sends a mutation, which writes");
}

/** The word that makes a curl or wget request to GitHub something other than a GET, if one does. */
function webWrite(w: string[]) {
  if (
    (w[0] !== "curl" && w[0] !== "wget") ||
    !w.some((a) => /\bgithub\.com\b/.test(a))
  )
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
