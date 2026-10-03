// Reading a merge plainly: which `gh pr merge` a simple command runs, and, in a line that names gh (or graphql) and
// merge, anything that could merge out of the merge check's sight, and an MCP tool that merges. The merge check
// (merge-gate.ts) proves what a plain `gh pr merge <number>` merges; the command check (tools.ts) refuses, through
// this file, the other ways it can read. It reads command text, so it stops a careless try, not a determined one.

import { gitOf, program } from "./shell-words";

// gh pr merge's options that take a value, and its switches; gh reads both anywhere after `gh`, before `pr` too.
const GH_VALUE = new Set([
  "-t",
  "--subject",
  "-b",
  "--body",
  "-F",
  "--body-file",
  "-A",
  "--author-email",
  "--match-head-commit",
  "-R",
  "--repo",
]);
const GH_SWITCH = new Set([
  "--squash",
  "-s",
  "--merge",
  "-m",
  "--rebase",
  "-r",
  "--delete-branch",
  "-d",
  "--auto",
  "--disable-auto",
  "--help",
  "-h",
  "--",
]);
const plain = (option: string) =>
  GH_VALUE.has(option) || GH_SWITCH.has(option) || /^-[smrdh]+$/.test(option);

// Programs a line that names gh and merge may run besides gh: they only read or print text, or move the shell.
const READS = new Set(
  "echo printf cat head tail wc cut tr jq tee ls grep egrep fgrep rg test [ [[ true false sleep cd pushd popd pwd :".split(
    " ",
  ),
);
// git's own commands that run nothing they are handed (no `-x`, editor or pager named on the line).
const GIT_READS = new Set(
  "add branch checkout commit diff fetch log ls-files merge merge-base pull push remote reset restore rev-parse show stash status switch worktree".split(
    " ",
  ),
);
const MENTION = /\bgh\b|graphql/i;

/** PURE: a simple command's words → the `gh pr merge` it runs, if any: the pull request named, and its options. */
export function mergeOf(words: string[]) {
  const w = program(words);
  if (w[0] !== "gh") return;
  const value = new Map<string, string>();
  const on = new Set<string>(); // every option's name, as written
  const rest: string[] = [];
  for (let i = 1; i < w.length; i++) {
    const a = w[i] ?? "";
    const eq = a.match(/^(--[\w-]+)=(.*)$/s);
    if (eq) value.set(eq[1] ?? "", eq[2] ?? "");
    else if (GH_VALUE.has(a)) value.set(a, w[++i] ?? "");
    else if (a.startsWith("-")) on.add(a);
    else rest.push(a);
  }
  if (rest[0] !== "pr" || rest[1] !== "merge") return;
  for (const name of value.keys()) on.add(name);
  return {
    pr: rest[2],
    repo: value.get("-R") ?? value.get("--repo"),
    head: value.get("--match-head-commit"),
    on,
  };
}

/** PURE: does a command line (its text and every word read from it) name gh (or graphql) and merge? */
export const namesMerge = (said: string) =>
  /merge/i.test(said) && MENTION.test(said);

/**
 * git, run plainly: a command from GIT_READS, with no setting given on the line (`-c`, which can name an editor), no
 * program handed to it to run (fetch and pull's `--upload-pack`, abbreviated too), and no remote helper (`ext::…`).
 */
const plainGit = (w: string[]) => {
  const g = gitOf(w);
  return (
    !!g &&
    GIT_READS.has(g.sub ?? "") &&
    !w
      .slice(1, w.indexOf(g.sub ?? ""))
      .some((a) => /^(-c|--config-env|--exec-path)/.test(a)) &&
    !g.args.some((a) => /^--(upl|receive-pack|exec\b)|::/.test(a))
  );
};

/** The gate's own command (`bun run gate …`, `bun scripts/done-gate.ts …`): it merges nothing, and a ruling's note may name gh and merge. */
const gateCommand = ([name, first, second]: string[]) =>
  name === "bun" &&
  ((first === "run" && second === "gate") ||
    /(^|\/)scripts\/done-gate\.ts$/.test(first ?? ""));

const PLAINLY =
  "Merge with a plain `gh pr merge <number> --squash --match-head-commit <commit>`, as a command of its own.";

/** PURE: why a tool other than the shell may not run: an MCP tool that merges a pull request or turns on its auto-merge. */
export const mergeToolRefusal = (name = "") =>
  /^mcp__/.test(name) &&
  /merge/i.test(name) &&
  /(^|_)pr(_|$)|pull|github/i.test(name)
    ? `it merges through an MCP tool (\`${name}\`), which names no commit the done gate proved. ${PLAINLY}`
    : undefined;

/**
 * PURE: why a simple command may not run, read for merges: a `gh pr merge` that is not plain (`--admin`, an option
 * a plain merge doesn't take, a pull request, repository or commit known only when it runs, GH_REPO, or handed to a
 * shell or eval, which the merge check never sees); and, when its line names gh and merge (`merging`), a program or
 * setting, or a command written in an array subscript, that could run a merge out of sight. `nested`: a shell or eval
 * was handed this command.
 */
export function mergeRefusal(
  words: string[],
  merging: boolean,
  nested: boolean,
): string | undefined {
  const m = mergeOf(words);
  if (m) {
    if (nested)
      return `it runs \`gh pr merge\` handed to a shell or eval, where the merge check can't see it. ${PLAINLY}`;
    if (m.on.has("--admin"))
      return "it uses `--admin`, which merges past main's required checks. Agents never do; a merge that needs it is Devesh's.";
    const odd = [...m.on].find((o) => !plain(o));
    if (odd)
      return `it uses \`${odd}\`, which a plain \`gh pr merge <number>\` doesn't take. ${PLAINLY}`;
    if ([m.pr, m.repo, m.head].some((v) => /[$`]/.test(v ?? "")))
      return `its pull request, repository and commit must be written out in full, so the merge check sees what is merged; this one holds \`$\` or a backquote. ${PLAINLY}`;
    if (words.some((a) => /^GH_(REPO|HOST)=/.test(a)))
      return `it names the repository by GH_REPO or GH_HOST, which the merge check doesn't read. Name it with \`-R <owner>/<name>\`, or run it in the checkout.`;
    return;
  }
  if (!merging) return;
  // bash runs a command written in an array subscript (`[[ 'x[$(…)]' -eq 0 ]]`, `printf -v 'y[$(…)]'`), quotes or not.
  const subscript = words.find((a) => /\[[^\]]*(\$\(|`)/.test(a));
  if (subscript)
    return `it writes a command inside a word (\`${subscript}\`), which bash runs when it reads the word as an array subscript, out of the merge check's sight. ${PLAINLY}`;
  const w = program(words);
  if (!w.length) return; // assignments alone set the shell's variables, which no program here reads as a command
  // A setting given before the program (GIT_EDITOR=…, PAGER=…) can name a command that program runs: one that names
  // merge, or one that runs a command and is known only when it runs (`GIT_SSH_COMMAND="$X"`).
  const setting = words
    .slice(0, words.length - w.length)
    .find(
      (a) =>
        /^[A-Za-z_]\w*=.*merge/is.test(a) ||
        /^(GIT_\w*|\w*(EDITOR|PAGER|COMMAND|ASKPASS|SHELL))=.*[$`]/s.test(a),
    );
  if (setting)
    return `it gives a command a setting that names merge or is known only when it runs (\`${setting}\`), which could run a merge out of the merge check's sight. ${PLAINLY}`;
  if (
    w[0] === "gh" ||
    plainGit(w) ||
    gateCommand(w) ||
    (READS.has(w[0] ?? "") &&
      !(w[0] === "rg" && w.some((a) => a.startsWith("--pre"))))
  )
    return;
  return `its line names gh and merge, and \`${w[0]}\` could run a merge out of the merge check's sight: a line that names both runs only gh, git's own commands and programs that only read or print text, so that every merge in it reads as a plain \`gh pr merge <number>\`. ${PLAINLY}`;
}
