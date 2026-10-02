// An agent's `gh pr merge` goes through only when the pull request's head commit was proven on this machine.

import { spawnSync } from "node:child_process";
import { checkoutsOf, toplevel } from "./checkouts";
import { git } from "./git";
import { type HookInput, say } from "./hook-io";
import { isProduct } from "./rules";
import { program, simpleCommands } from "./shell-words";
import type { Store } from "./store";
import { parseRuling } from "./verdict";

// gh pr merge options that take a value; any other option is a switch.
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

/** PURE: a simple command's words → the `gh pr merge` it runs, if any: the pull request named, and its options. */
export function mergeOf(words: string[]) {
  const w = program(words);
  if (w[0] !== "gh" || w[1] !== "pr") return;
  const value = new Map<string, string>();
  const on = new Set<string>();
  const rest: string[] = [];
  for (let i = 2; i < w.length; i++) {
    const a = w[i] ?? "";
    const eq = a.match(/^(--[\w-]+)=(.*)$/);
    if (eq) value.set(eq[1] ?? "", eq[2] ?? "");
    else if (GH_VALUE.has(a)) value.set(a, w[++i] ?? "");
    else if (a.startsWith("-")) on.add(a);
    else rest.push(a);
  }
  if (rest[0] !== "merge") return;
  return {
    pr: rest[1],
    repo: value.get("-R") ?? value.get("--repo"),
    head: value.get("--match-head-commit"),
    on,
  };
}

const runsGit = (words: string[], sub: string) => {
  const w = program(words);
  let i = 1;
  while ((w[i] ?? "").startsWith("-"))
    i += ["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(
      w[i] ?? "",
    )
      ? 2
      : 1;
  return w[0] === "git" && w[i] === sub;
};
const mergesThroughApi = (words: string[]) => {
  const w = program(words);
  return (
    w[0] === "gh" &&
    w[1] === "api" &&
    w.some((a) =>
      /\/pulls\/\d+\/merge\b|\b(mergePullRequest|enablePullRequestAutoMerge)\b/.test(
        a,
      ),
    )
  );
};
/** "owner/name" of a GitHub repository, from a remote URL, a pull request URL or `owner/name`. */
const ownerRepo = (s = "") =>
  s
    .toLowerCase()
    .replace(/\/pull\/.*$/, "")
    .replace(/\.git$/, "")
    .match(/([\w.-]+)\/([\w.-]+)\/?$/)
    ?.slice(1)
    .join("/");

export const deny = (why: string) =>
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `The done gate refused this merge: ${why}`,
      },
      systemMessage: `Done gate ✗ merge refused: ${why.split("\n")[0]}`,
    }),
  );

/**
 * An agent's `gh pr merge` goes through only for code proven on this machine: the pull request's head commit
 * passed `bun run gate`, and for product code the verifier ruled PASS on it. Merging is where work reaches main,
 * so it is checked here however the session got to it.
 */
export function mergeGate(
  repo: string,
  input: HookInput,
  store: Store,
  codex: boolean,
) {
  const command =
    typeof input.tool_input?.command === "string"
      ? input.tool_input.command
      : "";
  if (!/\bgh\b/.test(command)) return;
  const commands = simpleCommands(command);
  if (commands.some(mergesThroughApi))
    return deny(
      "merge with `gh pr merge <number>`, which the done gate checks, not through `gh api`.",
    );
  const merges = commands
    .map(mergeOf)
    .filter(
      (m) => m && !["--disable-auto", "--help", "-h"].some((f) => m.on.has(f)),
    );
  const m = merges[0];
  if (!m) return;
  if (merges.length > 1)
    return deny("merge one pull request at a time, each in its own command.");
  if (commands.some((c) => runsGit(c, "push")))
    return deny(
      "a push and a merge in one command leave no moment to check what is merged. Push, then run `gh pr merge <number>` on its own.",
    );
  const other = m.repo ?? (m.pr?.includes("/pull/") ? m.pr : undefined);
  if (
    other
      ? ownerRepo(other) !==
        ownerRepo(git(repo, ["remote", "get-url", "origin"], {}, true))
      : !checkoutsOf(repo).includes(toplevel(input.cwd ?? repo))
  )
    return; // another repository's pull request
  const number = m.pr
    ?.match(/^(\d+)$|\/pull\/(\d+)/)
    ?.slice(1)
    .find(Boolean);
  if (!number)
    return deny(
      "name the pull request by its number (`gh pr merge <number> …`), so that the one checked is the one merged.",
    );
  const view = spawnSync(
    "gh",
    [
      "pr",
      "view",
      number,
      ...(m.repo ? ["-R", m.repo] : []),
      "--json",
      "headRefOid,baseRefOid",
      "-q",
      '.headRefOid + " " + .baseRefOid',
    ],
    { cwd: input.cwd ?? repo, encoding: "utf8", timeout: 20_000 },
  );
  const [head = "", baseRef = ""] =
    view.status === 0 ? view.stdout.trim().split(" ") : [];
  if (!/^[0-9a-f]{40}$/.test(head))
    return deny(
      `it could not read pull request ${number}'s head commit (\`gh pr view\`: ${(view.stderr || "no answer").trim().split("\n")[0]}), so it can't check what would be merged.`,
    );
  const short = head.slice(0, 7);
  if (
    m.on.has("--auto") &&
    !(m.head && m.head.length >= 7 && head.startsWith(m.head))
  )
    return deny(
      `auto-merge would also merge whatever is pushed later, unchecked. Add \`--match-head-commit ${head}\`, or merge once the checks are green.`,
    );
  const have = (rev: string) =>
    git(repo, ["rev-parse", "--verify", "--quiet", `${rev}^{tree}`], {}, true);
  for (const rev of [head, baseRef])
    if (rev && !have(rev))
      spawnSync("git", ["fetch", "--quiet", "origin", rev], {
        cwd: repo,
        timeout: 20_000,
      });
  const tree = have(head);
  const where = `Check out ${short} with nothing else changed (a clean worktree: \`git worktree add --detach .claude/worktrees/check ${short}\`), run \`bun run gate\` there`;
  if (!tree)
    return deny(
      `its head commit ${short} is not in this repository, so nobody here has proven it. Fetch it; ${where.charAt(0).toLowerCase()}${where.slice(1)}, then merge.`,
    );
  const checks = store.get("checked", tree) ?? store.get("partial", tree);
  if (!checks)
    return deny(
      `its head commit ${short} has not passed \`bun run gate\` on this machine. ${where} (and the verifier, for product code), then merge.`,
    );
  // Against the base GitHub merges into (the local main may be behind), listed as the stop's rules list files.
  const base =
    (baseRef && git(repo, ["merge-base", head, baseRef], {}, true)) ||
    git(repo, ["merge-base", head, "origin/main"], {}, true);
  const product = git(
    repo,
    base
      ? [
          "-c",
          "core.quotePath=off",
          "diff",
          "--name-only",
          "--no-renames",
          base,
          head,
        ]
      : [
          "-c",
          "core.quotePath=off",
          "diff-tree",
          "--no-commit-id",
          "--name-only",
          "--no-renames",
          "-r",
          "--root",
          head,
        ],
    {},
    true,
  )
    .split("\n")
    .some(isProduct);
  const ruling = parseRuling(store.get("verdict", tree));
  if (!product || ruling?.verdict === "pass")
    return say(
      `Done gate ✓ merge of ${short}: ${checks}${ruling?.verdict === "pass" ? ` · verifier PASS: ${ruling.note}` : " (no product code changed)"}`,
    );
  return deny(
    !ruling
      ? codex
        ? `nobody independent has seen ${short} work, and Codex has no verifier agent. Ask Claude to run the verifier on ${short}, or leave the merge to Devesh.`
        : `nobody independent has seen ${short} work. ${where}, run the verifier agent there, then merge.`
      : ruling.verdict === "fail"
        ? `the verifier ruled FAIL on ${short}: ${ruling.note}`
        : `the verifier could not verify ${short} without something only Devesh can provide (${ruling.note}), so only Devesh merges it.`,
  );
}
