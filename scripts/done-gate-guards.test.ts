// The check before each command guards the done gate's own record and every merge. Each test drives the real hook
// in a throwaway repository holding a copy of the gate, as a session's tool call would, or the command check the hook
// runs (toolRefusal); GitHub is a stand-in `gh` on the PATH, never the real one.
import { afterAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { toolRefusal } from "./done-gate/tools";

// A hook test starts bun and git several times; with other agents busy on the machine that passes bun's 5 s.
setDefaultTimeout(60_000);
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const scratch = (name: string) => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), name)));
  dirs.push(d);
  return d;
};

const sh = (
  dir: string,
  cmd: string[],
  env: Record<string, string> = {},
  input?: string,
) =>
  spawnSync(cmd[0] as string, cmd.slice(1), {
    cwd: dir,
    env: { ...process.env, ...env },
    input,
    encoding: "utf8",
  });
const write = (dir: string, file: string, body: string) => {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), body);
};
const commit = (dir: string) => {
  sh(dir, ["git", "add", "-A"]);
  sh(dir, [
    "git",
    "-c",
    "user.email=t@t",
    "-c",
    "user.name=t",
    "commit",
    "-qm",
    "x",
  ]);
  return sh(dir, ["git", "rev-parse", "HEAD"]).stdout.trim();
};
// The repository's address on GitHub: an address that never resolves, so nothing here reaches the network.
const ORIGIN = "https://example.invalid/o/r.git";

/** A throwaway repository on `main` holding a copy of the gate, its origin at ORIGIN, origin/main at its first commit. */
function repo() {
  const dir = scratch("guards-");
  mkdirSync(join(dir, "scripts"));
  copyFileSync(
    join(import.meta.dir, "done-gate.ts"),
    join(dir, "scripts", "done-gate.ts"),
  );
  cpSync(
    join(import.meta.dir, "done-gate"),
    join(dir, "scripts", "done-gate"),
    { recursive: true },
  );
  write(
    dir,
    "docs/tracker/parse.js",
    readFileSync(
      join(import.meta.dir, "..", "docs", "tracker", "parse.js"),
      "utf8",
    ),
  );
  write(dir, "STATE.md", "# State\n");
  sh(dir, ["git", "init", "-q", "-b", "main"]);
  commit(dir);
  sh(dir, ["git", "remote", "add", "origin", ORIGIN]);
  sh(dir, ["git", "update-ref", "refs/remotes/origin/main", "HEAD"]);
  return dir;
}

type Out = { refused: boolean; why: string; told: string };
/** Runs the repository's own copy of the gate's hook before a tool call, from `cwd`. */
function hook(
  dir: string,
  tool: Record<string, unknown>,
  { cwd = dir, env = {}, codex = false } = {},
): Out {
  const r = sh(
    cwd,
    [
      "bun",
      join(dir, "scripts", "done-gate.ts"),
      "hook",
      ...(codex ? ["codex"] : []),
    ],
    env,
    JSON.stringify({
      hook_event_name: "PreToolUse",
      session_id: "s1",
      cwd,
      ...tool,
    }),
  );
  const out = r.stdout ? JSON.parse(r.stdout) : {};
  return {
    refused: out.hookSpecificOutput?.permissionDecision === "deny",
    why: out.hookSpecificOutput?.permissionDecisionReason ?? "",
    told: out.systemMessage ?? "",
  };
}
const bash = (command: string) => ({
  tool_name: "Bash",
  tool_input: { command },
});

describe("the gate's own record (.git/done-gate) and hook", () => {
  const RECORD = "it touches the done gate's own record";
  const HOOK = "it runs the done gate's hook by hand";
  const CODE = "it hands code that names the done gate";

  it("refuses, and tells Devesh about, a command that touches the record, however it is spelt", () => {
    const dir = repo();
    const wt = join(scratch("guards-wt-"), "w");
    sh(dir, ["git", "worktree", "add", "-qb", "feat/w", wt]);
    const refused: [string, string, string?][] = [
      ["rm -rf .git/done-gate", RECORD],
      ["ls .git/done-gate/checked", RECORD],
      ["cat .git/done-gate/verdict/abc", RECORD],
      [
        `echo '{"verdict":"pass","note":"saw it"}' > .git/done-gate/verdict/abc`,
        RECORD,
      ],
      ["tee .git/done-gate/checked/abc < /tmp/x", RECORD],
      ['cp /tmp/x "$PWD/.git/done-gate/checked/abc"', RECORD],
      ["mv /tmp/x .git//done-gate/checked/abc", RECORD],
      ["sed -i '' 's/fail/pass/' .git/./done-gate/verdict/abc", RECORD],
      [`rm -rf ${dir}/.git/done-gate`, RECORD],
      ['rm -rf "$(git rev-parse --git-common-dir)/done-gate"', RECORD],
      [
        "rm -rf $(git rev-parse --path-format=absolute --git-common-dir)/done*",
        RECORD,
      ],
      ['cd "$(git rev-parse --git-common-dir)" && rm -rf d*', RECORD],
      ["cd .git && rm -rf done-gate", RECORD],
      ["find .git -name 'done*' -delete", RECORD],
      ["rm -rf .git/*", RECORD],
      ["rm -rf .git", RECORD],
      ["mv .git /tmp/old-git", RECORD],
      ['rsync -a /tmp/forged/ "$(git rev-parse --git-common-dir)/"', RECORD],
      ["ls .git/{done-gate,hooks}", RECORD],
      ["git rev-parse --git-path done-gate | xargs rm -rf", RECORD],
      ['ln -s "$(git rev-parse --git-common-dir)" g', RECORD],
      ["find . -name done-gate -exec rm -rf {} +", RECORD],
      [`sh -c 'rm -rf .g""it/done-gate'`, RECORD],
      ["python3 -c \"import shutil; shutil.rmtree('.git/done-gate')\"", RECORD],
      [
        "bun -e \"const { Store } = await import('./scripts/done-gate/store.ts')\"",
        CODE,
      ],
      // From a worktree, whose .git is a file naming a folder inside the main checkout's .git.
      [`rm -rf ${dir}/.git/done-gate/checked`, RECORD, wt],
      ["rm -rf \"$(sed 's/gitdir: //' .git)/../../done-gate\"", RECORD, wt],
      ["rm -rf ../../done-gate", RECORD, join(dir, ".git", "worktrees", "w")],
      // In the git folder itself, a relative name or a pattern reaches the record.
      ["rm -rf done-gate", RECORD, join(dir, ".git")],
      ["rm -rf *", RECORD, join(dir, ".git")],
    ];
    const wrong = refused.flatMap(([command, why, cwd]) => {
      const r = hook(dir, bash(command), { cwd: cwd ?? dir });
      return r.refused &&
        r.why.includes(why) &&
        r.told.startsWith(`Done gate ✗ command refused: ${why}`)
        ? []
        : [
            `${command}\n    got: ${r.refused ? r.why : "(allowed)"} / told: ${r.told || "(nothing)"}`,
          ];
    });
    expect(wrong).toEqual([]);
  });

  it("refuses, and tells Devesh about, running the gate's hook by hand", () => {
    const dir = repo();
    const wrong = [
      "bun scripts/done-gate.ts hook",
      `echo '{"hook_event_name":"SubagentStop","agent_type":"verifier"}' | bun scripts/done-gate.ts hook`,
      "bun ./scripts/done-gate.ts hook codex < input.json",
      'bun "$CLAUDE_PROJECT_DIR/scripts/done-gate.ts" hook',
      'f=scripts/done-gate.ts; bun "$f" hook',
      "timeout 5 bun scripts/done-gate.ts hook",
      "bun run gate hook",
      "bun run gates -- hook",
      "bun gate hook",
      "sh -c 'bun scripts/done-gate.ts hook'",
      'bash -c "bun run gate hook"',
    ].flatMap((command) => {
      const r = hook(dir, bash(command));
      return r.refused &&
        r.told.startsWith(`Done gate ✗ command refused: ${HOOK}`)
        ? []
        : [
            `${command}\n    got: ${r.why || "(allowed)"} / told: ${r.told || "(nothing)"}`,
          ];
    });
    expect(wrong).toEqual([]);
  });

  it("refuses, and tells Devesh about, an edit or a Codex patch that writes into the record, through a link too", () => {
    const dir = repo();
    symlinkSync(join(dir, ".git"), join(dir, "g"));
    const edits = [
      {
        tool_name: "Write",
        tool_input: { file_path: ".git/done-gate/verdict/abc", content: "{}" },
      },
      {
        tool_name: "Write",
        tool_input: {
          file_path: join(dir, ".git", "done-gate", "checked", "abc"),
          content: "x",
        },
      },
      {
        tool_name: "Edit",
        tool_input: {
          file_path: join(dir, ".git", "done-gate", "verdict", "abc"),
          old_string: "fail",
          new_string: "pass",
        },
      },
      {
        tool_name: "MultiEdit",
        tool_input: {
          file_path: ".git/worktrees/../done-gate/verdict/abc",
          edits: [],
        },
      },
      {
        tool_name: "NotebookEdit",
        tool_input: { notebook_path: ".git/done-gate/x.ipynb", new_source: "" },
      },
      {
        tool_name: "Write",
        tool_input: { file_path: "g/done-gate/checked/abc", content: "x" },
      },
    ];
    for (const edit of edits)
      expect(hook(dir, edit)).toEqual({
        refused: true,
        why: expect.stringContaining(RECORD),
        told: expect.stringMatching(
          /^Done gate ✗ edit refused: it touches the done gate's own record/,
        ),
      });
    const patch = {
      tool_name: "apply_patch",
      tool_input: {
        command:
          "*** Begin Patch\n*** Add File: .git/done-gate/verdict/abc\n+{}\n*** End Patch\n",
      },
    };
    expect(hook(dir, patch, { codex: true }).why).toContain(RECORD);
  });

  it("lets through commands and edits that only name the gate's code or read the git folder", () => {
    const dir = repo();
    const commands = [
      "git rev-parse --git-common-dir",
      "cat .git",
      "ls -la .git",
      "cat .git/HEAD",
      'git -C "$(git rev-parse --path-format=absolute --git-common-dir)/.." worktree list',
      "git log --oneline -3",
      "ls scripts/done-gate",
      "find scripts -name '*done-gate*'",
      "cat .gitignore && du -sh .git",
      "rm -f .git/index.lock",
      'echo "scratch/" >> .git/info/exclude',
      'rg -n "stateDir" scripts/done-gate',
      "bunx biome check --write scripts/done-gate/store.ts",
      "cat scripts/done-gate/hook.ts",
      "grep -n hook scripts/done-gate.ts",
      "bun scripts/done-gate.ts rules --base origin/main",
      "bun test scripts/done-gate.test.ts -t hook",
      'git commit -qm "the gate keeps its record per code state"',
    ];
    const refused = commands.flatMap((command) => {
      const r = hook(dir, bash(command));
      return r.refused ? [`${command}\n    refused: ${r.why}`] : [];
    });
    expect(refused).toEqual([]);
    expect(
      hook(dir, bash("cat HEAD"), { cwd: join(dir, ".git") }).refused,
    ).toBe(false);
    for (const file_path of ["docs/notes.md", "scripts/done-gate/store.ts"])
      expect(
        hook(dir, {
          tool_name: "Write",
          tool_input: { file_path, content: "x" },
        }).refused,
      ).toBe(false);
  });
});

// Each command a line may not run when it names gh (or graphql) and merge, and a phrase its reason must hold.
const SHA = "0123456789abcdef0123456789abcdef01234567";
const ADMIN = "`--admin`";
const PLAIN = "a plain `gh pr merge <number>`";
const LITERAL = "written out in full";
const REPO_ENV = "GH_REPO";
const NESTED = "handed to a shell or eval";
const SETTING = "a setting that names";
const API = "`gh api` may only read";
const LOOP = "not one of the loop's own GitHub steps";
const REFUSED: [string, string][] = [
  // --admin skips main's required checks, however it is written.
  [`gh pr merge 7 --squash --admin --match-head-commit ${SHA}`, ADMIN],
  ["gh pr merge 7 --admin", ADMIN],
  ["gh pr merge --admin=true 7", ADMIN],
  ["gh -R o/r pr merge 7 --admin", ADMIN],
  // An option a plain merge doesn't take, and a pull request, repository or commit known only when it runs.
  ["gh pr merge 7 --squash -x", PLAIN],
  ['gh pr merge 7 -R "$REPO" --squash', LITERAL],
  ['gh pr merge "https://github.com/$R/pull/7"', LITERAL],
  ['gh pr merge 7 --match-head-commit "$(git rev-parse HEAD)"', LITERAL],
  ['for n in 7 8; do gh pr merge "$n" --squash; done', LITERAL],
  ["GH_REPO=o/r gh pr merge 7", REPO_ENV],
  ["env GH_REPO=o/r gh pr merge 7", REPO_ENV],
  // A merge handed to a shell or eval, which the merge check never sees, quotes and all.
  [`sh -c 'g""h pr merge 7'`, NESTED],
  [`eval 'g""h pr merge 7'`, NESTED],
  // In a line that names gh and merge, a program that could run a merge out of sight.
  ["alias m='g''h pr merge'", PLAIN],
  ["./scripts/gh-merge.sh 7", PLAIN],
  ["bash merge.sh 7 && gh pr view 7", PLAIN],
  ["source merge.sh; gh pr view 7", PLAIN],
  ["make merge && gh pr checks 7", PLAIN],
  ["git -c core.editor='gh pr merge 7 --squash' commit", PLAIN],
  ["git rebase -x 'gh pr merge 7' main", PLAIN],
  ["rg --pre 'gh pr merge 7' x", PLAIN],
  ["GIT_EDITOR='gh pr merge 7' git commit", SETTING],
  // gh api: a GraphQL query known only when it runs, the merge address and the merge mutation.
  ['gh api graphql -f query="$(cat merge.graphql)"', API],
  ['gh api graphql -f query="$Q"', API],
  ["gh api -X PUT repos/o/r/pulls/7/merge", API],
  [
    "gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: \"x\"}) { clientMutationId } }'",
    API,
  ],
  // gh alias, which would name a merge something else (refused since the tools item: not a loop step).
  ["gh alias set m 'pr merge'", LOOP],
  ["gh alias import aliases.yml", LOOP],
];

// Lines that name gh and merge but read plainly: reads, git's own merge, text, and a plain merge.
const ALLOWED = [
  "gh pr view 7 --json mergeable,mergeStateStatus",
  "gh pr list --state merged --json number,mergedAt",
  "gh pr view 7 --json mergeCommit -q .mergeCommit.oid",
  "gh pr view 7 --json body -q .body | grep -c merge",
  "git merge --ff-only origin/main && gh pr view 7",
  "git merge-base HEAD origin/main",
  "git fetch origin && git merge-base --is-ancestor HEAD origin/main && gh pr list --state merged",
  `gh pr merge 7 --squash --delete-branch --match-head-commit ${SHA}`,
  `gh pr merge 7 --auto --squash --match-head-commit=${SHA}`,
  `gh pr merge 7 -sd --match-head-commit ${SHA}`,
  `gh -R devesh911/revenue-os pr merge 7 --squash --match-head-commit ${SHA}`,
  `gh pr checks 7 --watch && gh pr merge 7 --squash --match-head-commit ${SHA}`,
  `cd ../w && gh pr merge 7 --squash --match-head-commit ${SHA}`,
  "gh pr merge 7 --disable-auto",
  'grep -rn "gh pr merge" AGENTS.md .claude/skills',
  'git commit -qm "every gh pr merge names its commit"',
  'gh pr create --title "Merges name their commit" --body-file /tmp/body.md',
  "gh api repos/o/r/pulls/7 --jq .mergeable",
  'gh api graphql -f query=\'{ repository(owner: "o", name: "r") { pullRequest(number: 7) { mergeable } } }\'',
  "cat > /tmp/body.md <<'EOF'\nMerge with gh pr merge 7 once green\nEOF",
  'echo "merge when green" && gh pr checks 7',
];

// What the check may look up about the folders a command reaches: every one is on a feat/ branch, with no .env file.
const look = { branchOf: () => "feat/x", envFileIn: () => undefined };

describe("a line that names gh and merge must read as a plain `gh pr merge <number>`", () => {
  it("refuses every line the table lists, each for the right reason", () => {
    const wrong = REFUSED.flatMap(([command, why]) => {
      const got = toolRefusal(command, look);
      return got?.includes(why)
        ? []
        : [`${command}\n    expected: ${why}\n    got: ${got ?? "(allowed)"}`];
    });
    expect(wrong).toEqual([]);
  });

  it("lets reads, git's own merge, text and a plain merge through", () => {
    const refused = ALLOWED.flatMap((command) => {
      const got = toolRefusal(command, look);
      return got ? [`${command}\n    refused: ${got}`] : [];
    });
    expect(refused).toEqual([]);
  });
});

describe("the merge check: every agent merge names the exact commit that passed the gate", () => {
  type Run = {
    name?: string;
    head_sha?: string;
    status?: string;
    conclusion?: string | null;
    app?: { id: number };
  };
  /** A stand-in gh: `gh pr view` names `head`, `gh api` answers `runs` (or fails), and every call is logged. */
  const fakeGh = (head: string, runs?: Run[]) => {
    const bin = scratch("guards-gh-");
    const log = join(bin, "calls.txt");
    write(
      bin,
      "answer.json",
      JSON.stringify({
        total_count: runs?.length ?? 0,
        check_runs: runs ?? [],
      }),
    );
    writeFileSync(
      join(bin, "gh"),
      `#!/bin/sh\necho "$*" >> "${log}"\ncase "$1" in\n  pr) echo ${head} ;;\n  api) ${runs ? `cat "${join(bin, "answer.json")}"` : "echo 'HTTP 502' >&2; exit 1"} ;;\nesac\n`,
      { mode: 0o755 },
    );
    return {
      env: { PATH: `${bin}:${process.env.PATH}` },
      calls: () =>
        existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [],
    };
  };
  /** A pull request's head: a commit changing only notes (no product code, so no verifier is needed). */
  const pullRequest = (dir: string) => {
    sh(dir, ["git", "checkout", "-qb", "feat/notes"]);
    write(dir, "docs/notes.md", `notes ${Math.random()}\n`);
    const head = commit(dir);
    sh(dir, ["git", "checkout", "-q", "main"]);
    return {
      head,
      tree: sh(dir, ["git", "rev-parse", `${head}^{tree}`]).stdout.trim(),
    };
  };
  const record = (
    dir: string,
    kind: "checked" | "partial",
    tree: string,
    text: string,
  ) => write(dir, `.git/done-gate/${kind}/${tree}`, text);
  const merge = (
    dir: string,
    command: string,
    gh: ReturnType<typeof fakeGh>,
    cwd = dir,
  ) => hook(dir, bash(command), { cwd, env: gh.env });

  it("refuses a merge that doesn't name the exact commit the gate proved, and lets the one that does through", () => {
    const dir = repo();
    const { head, tree } = pullRequest(dir);
    const gh = fakeGh(head);
    record(dir, "checked", tree, "typecheck, lint, guards, 3 tests");
    const bare = merge(dir, "gh pr merge 7 --squash", gh);
    expect(bare.refused).toBe(true);
    expect(bare.why).toContain(`--match-head-commit ${head}`);
    expect(bare.told).toStartWith("Done gate ✗ merge refused: ");
    expect(
      merge(
        dir,
        `gh pr merge 7 --squash --match-head-commit ${head.slice(0, 7)}`,
        gh,
      ).why,
    ).toContain(`--match-head-commit ${head}`);
    expect(
      merge(dir, `gh pr merge 7 --squash --match-head-commit ${SHA}`, gh)
        .refused,
    ).toBe(true);
    expect(
      merge(dir, `gh pr merge 7 --squash --match-head-commit ${head}`, gh),
    ).toEqual({
      refused: false,
      why: "",
      told: `Done gate ✓ merge of ${head.slice(0, 7)}: typecheck, lint, guards, 3 tests (no product code changed)`,
    });
    expect(gh.calls().some((c) => c.startsWith("api"))).toBe(false); // a full result needs no word from GitHub
  });

  it("reads a merge however gh reads it: quotes in its name, its options before `pr`, or from a folder outside the checkout", () => {
    const dir = repo();
    const { head } = pullRequest(dir); // never proven here
    const gh = fakeGh(head);
    for (const command of [
      `g''h pr merge 7 --squash --match-head-commit ${head}`,
      `g\\h pr merge 7 --squash --match-head-commit ${head}`,
      `gh -R o/r pr merge 7 --squash --match-head-commit ${head}`,
      `gh --repo=o/r pr merge 7 --squash --match-head-commit ${head}`,
    ])
      expect(merge(dir, command, gh).why).toContain(
        `${head.slice(0, 7)} has not passed`,
      );
    // A folder that is not a checkout of this repository, but whose remote is its address: gh merges its PR.
    const elsewhere = scratch("guards-elsewhere-");
    sh(elsewhere, ["git", "init", "-q"]);
    sh(elsewhere, ["git", "remote", "add", "upstream", ORIGIN]);
    expect(
      merge(
        dir,
        `gh pr merge 7 --squash --match-head-commit ${head}`,
        gh,
        elsewhere,
      ).why,
    ).toContain(`${head.slice(0, 7)} has not passed`);
    // Another repository's pull request is that repository's business.
    sh(elsewhere, [
      "git",
      "remote",
      "set-url",
      "upstream",
      "https://example.invalid/someone/else.git",
    ]);
    expect(
      merge(
        dir,
        `gh pr merge 7 --squash --match-head-commit ${head}`,
        gh,
        elsewhere,
      ).refused,
    ).toBe(false);
  });

  it("counts a partial result (no Docker, so no database tests) only when GitHub reports `checks` passed on that exact commit", () => {
    const dir = repo();
    const { head, tree } = pullRequest(dir);
    record(
      dir,
      "partial",
      tree,
      "typecheck, lint, guards, NOT run here (no Docker): tests, database policies, browser checks; CI runs them",
    );
    const command = `gh pr merge 7 --squash --match-head-commit ${head}`;
    const run = (over: Run = {}): Run => ({
      name: "checks",
      head_sha: head,
      status: "completed",
      conclusion: "success",
      app: { id: 15368 },
      ...over,
    });
    const passed = fakeGh(head, [run()]);
    const r = merge(dir, command, passed);
    expect(r.refused).toBe(false);
    expect(r.told).toContain("GitHub reports `checks` passed on it");
    // Asked with a read: the check runs named `checks` on that commit, no method, no fields.
    expect(passed.calls().filter((c) => c.startsWith("api"))).toEqual([
      `api repos/o/r/commits/${head}/check-runs?check_name=checks&filter=latest`,
    ]);
    for (const [runs, why] of [
      [[run({ conclusion: "failure" })], "failure"],
      [[run({ status: "in_progress", conclusion: null })], "in_progress"],
      [[run({ app: { id: 99 } })], "no `checks` run by GitHub Actions"],
      [[run({ head_sha: SHA })], "no `checks` run by GitHub Actions"],
      [[], "no `checks` run by GitHub Actions"],
      [undefined, "HTTP 502"],
    ] as [Run[] | undefined, string][]) {
      const refused = merge(dir, command, fakeGh(head, runs));
      expect(refused.refused).toBe(true);
      expect(refused.why).toContain("passed `bun run gate` here only in part");
      expect(refused.why).toContain(why);
    }
  });

  it("refuses a merge however it is spelt while a file of the gate fails to load", () => {
    const dir = repo();
    const words = join(dir, "scripts", "done-gate", "shell-words.ts");
    writeFileSync(
      words,
      readFileSync(words, "utf8").replace(
        "export function simpleCommands(",
        "export function simpleCommandz(",
      ),
    );
    for (const command of ["g''h pr merge 7 --squash", "gh pr m\\erge 7"])
      expect(hook(dir, bash(command)).why).toContain(
        "it could not load the done gate",
      );
  });
});
