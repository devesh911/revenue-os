// An agent's `gh pr merge` goes through only when it names the exact head commit of the pull request, and that commit
// was proven on this machine (a partial proof, with no database tests, only once GitHub reports `checks` passed on it).

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { checkoutsOf, toplevel } from "./checkouts";
import { git } from "./git";
import { checksNotPassed } from "./github-checks";
import { type HookInput, say } from "./hook-io";
import { mergeOf } from "./merge-reading";
import { isProduct } from "./rules";
import { gitOf, positionals, program, simpleCommands } from "./shell-words";
import type { Store } from "./store";
import { rulingOn } from "./verdict";

const runsGit = (words: string[], sub: string) => gitOf(words)?.sub === sub;
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

/** Refuses the tool call, telling the agent why and Devesh the first line: a merge, a command or an edit (hook.ts). */
export const deny = (why: string, what = "merge") =>
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `The done gate refused this ${what}: ${why}`,
      },
      systemMessage: `Done gate ✗ ${what} refused: ${why.split("\n")[0]}`,
    }),
  );

/**
 * An agent's `gh pr merge` goes through only for code proven on this machine: it names the pull request's head
 * commit exactly (`--match-head-commit`, so nothing pushed later is merged), that commit passed `bun run gate`
 * (a partial pass only once GitHub reports `checks` passed on it), and for product code the verifier ruled PASS on
 * it. Merging is where work reaches main, so it is checked here however the session got to it.
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
  const commands = simpleCommands(command); // read as the shell reads it: `g''h` is gh too
  if (commands.some(mergesThroughApi))
    return deny(
      "merge with `gh pr merge <number>`, which the done gate checks, not through `gh api`.",
    );
  // Every folder the command visits before its merge, with each `cd` or `pushd` (a subshell's too, as reading the
  // line can't tell where one ends); undefined for one known only when it runs (`cd "$D"`, `cd -`, `popd`).
  const cwd = input.cwd ?? repo;
  let dir: string | undefined = cwd;
  const visited: (string | undefined)[] = [cwd];
  const merges: NonNullable<ReturnType<typeof mergeOf>>[] = [];
  for (const words of commands) {
    const m = mergeOf(words);
    if (m && !["--disable-auto", "--help", "-h"].some((f) => m.on.has(f)))
      merges.push(m);
    const [name = "", ...args] = program(words);
    if (!/^(cd|pushd|popd)$/.test(name) || merges.length) continue;
    const to = name === "popd" ? "-" : (positionals(args)[0] ?? "~");
    dir =
      dir === undefined || /^-$|[$`*?[{]/.test(to)
        ? undefined
        : resolve(dir, to.replace(/^~(?=\/|$)/, homedir()));
    visited.push(dir);
  }
  const m = merges[0];
  if (!m) return;
  if (merges.length > 1)
    return deny("merge one pull request at a time, each in its own command.");
  if (commands.some((c) => runsGit(c, "push")))
    return deny(
      "a push and a merge in one command leave no moment to check what is merged. Push, then run `gh pr merge <number>` on its own.",
    );
  const ours = ownerRepo(git(repo, ["remote", "get-url", "origin"], {}, true));
  const named = m.repo ?? (m.pr?.includes("/pull/") ? m.pr : undefined);
  // With no repository named, gh merges in the folder's own: this one's unless the folder has remotes, all
  // elsewhere. The merge is another repository's only if every folder the command visits is.
  const elsewhere = (folder: string | undefined) => {
    if (folder === undefined || !existsSync(folder)) return false;
    const remotes = git(folder, ["remote", "-v"], {}, true)
      .split("\n")
      .map((l) => l.split(/\s+/)[1] ?? "")
      .filter(Boolean);
    return (
      !checkoutsOf(repo).includes(toplevel(folder)) &&
      remotes.length > 0 &&
      !remotes.some((url) => ownerRepo(url) === ours)
    );
  };
  if (named ? ownerRepo(named) !== ours : visited.every(elsewhere)) return; // another repository's pull request
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
    { cwd: repo, encoding: "utf8", timeout: 20_000 },
  );
  const [head = "", baseRef = ""] =
    view.status === 0 ? view.stdout.trim().split(" ") : [];
  if (!/^[0-9a-f]{40}$/.test(head))
    return deny(
      `it could not read pull request ${number}'s head commit (\`gh pr view\`: ${(view.stderr || "no answer").trim().split("\n")[0]}), so it can't check what would be merged.`,
    );
  const short = head.slice(0, 7);
  if (m.head?.toLowerCase() !== head)
    return deny(
      `name the exact commit it merges, so nothing pushed after this check is merged unchecked: pull request ${number}'s head commit is ${head}, so add \`--match-head-commit ${head}\`${m.head ? ` (not ${m.head})` : ""}.`,
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
  const checked = store.get("checked", tree);
  const partial = checked ? undefined : store.get("partial", tree);
  if (!checked && !partial)
    return deny(
      `its head commit ${short} has not passed \`bun run gate\` on this machine. ${where} (and the verifier, for product code), then merge.`,
    );
  // A partial pass (no Docker here, so no database checks) counts only once GitHub reports `checks` passed on it; a
  // stop's pass while background work ran is never one (verdict.ts).
  const missing =
    partial && checksNotPassed(head, named ? ownerRepo(named) : ours, repo);
  if (missing)
    return deny(
      `its head commit ${short} passed \`bun run gate\` here only in part (${partial}), and ${missing}. Wait until \`gh pr checks ${number}\` shows \`checks\` passed, or run \`bun run gate\` on a machine with Docker, then merge.`,
    );
  const checks =
    checked ??
    `${partial} · tests, database policies and browser checks did not run here; GitHub reports \`checks\` passed on it`;
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
          "-z", // a name holding a quote comes whole, never quoted
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
          "-z",
          "--no-renames",
          "-r",
          "--root",
          head,
        ],
    {},
    true,
  )
    .split("\0")
    .some(isProduct);
  const ruling = rulingOn(store, tree);
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
