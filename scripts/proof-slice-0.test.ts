// Slice 0's proof steps (scripts/proof/slice-0*.ts), run as `bun run proof 0` runs them: against this checkout, in
// scratch copies each step makes and removes. A step whose safeguard this checkout has must pass here, and every
// refusal step must fail on a checkout whose gate, hooks and guards refuse nothing, so none passes on its own. The
// scripted agent session and the verifier's run use a stand-in `claude` on the PATH, never a real model or key, and
// GitHub's run records are judged as data. Two steps run only in `bun run proof 0`: the whole suite run at once
// (it starts the suite, this file included) and the read of GitHub's real run records.
import { afterAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { currentSlice, nextItem, parseRoadmap } from "../docs/tracker/parse.js";
import { runSteps } from "./proof/run";
import { steps as slice0 } from "./proof/slice-0";
import { agentSession, crossCompany } from "./proof/slice-0-agents";
import {
  adminMerge,
  disallowedModel,
  interrupted,
  noDockerStop,
  selfPass,
  undeliveredRuling,
  unverifiedMerge,
  unverifiedStop,
  wrappedMerge,
} from "./proof/slice-0-gate";
import { banner } from "./proof/slice-0-plan";
import {
  barrelExport,
  deletedTest,
  editedMigration,
  fixWhenTouchedUnanswered,
  loosenedGate,
  noFirstLine,
  rewrittenCi,
  unexplainedRuleChange,
} from "./proof/slice-0-rules";
import { runRecordProblems } from "./proof/slice-0-runs";
import {
  passesOnMain,
  patternFileGuard,
  unrunLine,
} from "./proof/slice-0-tests";
import { agentToolsRefused, hooksWarn } from "./proof/slice-0-tools";
import type { Step } from "./proof/step";

setDefaultTimeout(120_000); // a step clones this checkout and starts bun and git several times
const ROOT = join(import.meta.dir, "..");
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const scratch = (name: string) => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), name)));
  dirs.push(d);
  return d;
};
const KEY = "A second Anthropic key for the automatic test conversations";
const STATE = `PHASE: SETUP\n\n## Waiting on Devesh\n- [ ] **${KEY}**: saved in GitHub as ANTHROPIC_EVALS_KEY\n## Decisions in force\n`;
const prove = (steps: Step[], root = ROOT, env: NodeJS.ProcessEnv = {}) =>
  runSteps(steps, {
    root,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    state: STATE,
    dir: scratch("proof-0-report-"),
  });
const git = (dir: string, ...args: string[]) =>
  spawnSync("git", args, { cwd: dir, encoding: "utf8" }).stdout.trim();
const failures = (results: { does: string; outcome: string; seen: string }[]) =>
  results.flatMap((r) =>
    r.outcome === "passed" ? [] : [`${r.does}\n  ${r.seen}`],
  );

// The refusals whose safeguard is on main today; the others' items are still being built.
const ON_MAIN = [
  hooksWarn,
  unexplainedRuleChange,
  loosenedGate,
  rewrittenCi,
  noFirstLine,
  fixWhenTouchedUnanswered,
  agentToolsRefused,
  editedMigration,
  patternFileGuard,
  unverifiedStop,
  unverifiedMerge,
  selfPass,
  undeliveredRuling,
  disallowedModel,
  wrappedMerge,
  adminMerge,
];
const COMING = [
  noDockerStop,
  deletedTest,
  barrelExport,
  unrunLine,
  passesOnMain,
  interrupted,
];

describe("Slice 0's proof steps", () => {
  it("follow its Proof line: one step per check it names, in its order, each in its words", () => {
    const named = [
      "four law files",
      "`bun run cycle --banner`",
      "scripted fresh agent session",
      "entry file missing",
      "doesn't explain it or that adds no line to STATE.md → Rule changes",
      "loosens its own copy of the gate",
      "rewrites ci.yml",
      "without its roadmap first line",
      "fix-when-touched area",
      "push to the cloud database",
      "GitHub's run records",
      "edits a migration already on main",
      "two test runs started at once",
      "pattern file naming a missing file",
      "deliberately unverified change",
      "its merge",
      "records for itself",
      "the verifier did not deliver",
      "not on the allowed list",
      "wrapped in another command",
      "`--admin`",
      "without Docker",
      "deleted test",
      "only a barrel file re-exports",
      "added product line no test runs",
      "already passes on main",
      "cross-company test",
      "interrupted, unchecked change",
    ];
    const proof =
      parseRoadmap(git(ROOT, "show", "HEAD:ROADMAP.md")).slices.find(
        (s) => s.n === 0,
      )?.Proof ?? "";
    expect(named.filter((n) => !proof.includes(n))).toEqual([]);
    expect(slice0.length).toBe(named.length);
    expect(
      slice0.flatMap((s, i) =>
        s.does.includes(named[i] ?? "") ? [] : [`${i + 1}: ${s.does}`],
      ),
    ).toEqual([]);
  });

  it("the banner step passes, naming the slice and item the tracker's parser finds on origin/main", async () => {
    const [r] = await prove([banner]); // the banner fetches origin/main first
    const roadmap = parseRoadmap(
      git(ROOT, "show", "origin/main:ROADMAP.md"),
    ).slices;
    const cur = currentSlice(roadmap);
    expect(r?.outcome).toBe("passed");
    expect(r?.seen).toContain(`Slice ${cur?.n}`);
    expect(r?.seen).toContain(nextItem(cur)?.text.slice(0, 40) ?? "no item");
  });

  it("each refusal whose safeguard is on this checkout passes here, refused for its own reason", async () => {
    expect(failures(await prove(ON_MAIN))).toEqual([]);
  }, 600_000);

  it("every refusal step fails on a checkout whose gate, hooks and guards refuse nothing", async () => {
    const weak = scratch("proof-0-weak-");
    git(weak, "init", "-q", "-b", "main");
    git(weak, "fetch", "-q", "--no-tags", ROOT, "HEAD"); // CI checks out a detached commit, which a clone may not
    git(weak, "checkout", "-q", "-B", "main", "FETCH_HEAD");
    // The gate's entry does nothing, the hooks go quiet when it is missing, and the guards pass anything.
    writeFileSync(join(weak, "scripts", "done-gate.ts"), "process.exit(0);\n");
    writeFileSync(join(weak, "scripts", "guards.sh"), "exit 0\n");
    const quiet = JSON.stringify({
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: "command",
                command:
                  'f="$CLAUDE_PROJECT_DIR/scripts/done-gate.ts"; [ -f "$f" ] || exit 0; exec bun "$f" hook',
              },
            ],
          },
        ],
      },
    });
    writeFileSync(join(weak, ".claude", "settings.json"), quiet);
    writeFileSync(join(weak, ".codex", "hooks.json"), quiet);
    spawnSync(
      "git",
      [
        "-c",
        "user.email=proof@example.invalid",
        "-c",
        "user.name=proof",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-qam",
        "a gate that refuses nothing",
      ],
      { cwd: weak },
    );
    const results = await prove([...ON_MAIN, ...COMING], weak);
    expect(results.filter((r) => r.outcome !== "failed")).toEqual([]);
    expect(results.every((r) => r.seen.length > 0)).toBe(true);
  }, 600_000);
});

type Answer = { when?: string; first?: string; say: string };
/**
 * A stand-in `claude` that logs each call (its arguments, key, GitHub token, home and folder) and answers as
 * `claude -p --output-format stream-json` does: the first answer whose `when` the prompt (its last argument) holds,
 * after running `first` in its folder.
 */
const standIn = (answers: Answer[]) => {
  const bin = scratch("proof-0-claude-");
  const log = join(bin, "calls.txt");
  const events = (text: string) =>
    [
      { type: "system", subtype: "init", session_id: "stand-in" },
      { type: "assistant", message: { content: [{ type: "text", text }] } },
      {
        type: "result",
        subtype: "success",
        is_error: false,
        session_id: "stand-in",
        result: text,
      },
    ]
      .map((e) => `${JSON.stringify(e)}\n`)
      .join("");
  const cases = answers.map((a, i) => {
    writeFileSync(join(bin, `answer-${i}.txt`), events(a.say));
    return `  *"${a.when ?? ""}"*) ${a.first ?? ":"} >/dev/null 2>&1; cat "${join(bin, `answer-${i}.txt`)}" ;;`;
  });
  writeFileSync(
    join(bin, "claude"),
    [
      "#!/bin/sh",
      `{ echo "args: $*"; echo "key: $ANTHROPIC_API_KEY"; echo "gh: \${GH_TOKEN:-none}"; echo "home: $HOME"; echo "cwd: $(pwd)"; } >> "${log}"`,
      "for last; do :; done",
      'case "$last" in',
      ...cases,
      "esac",
    ].join("\n"),
    { mode: 0o755 },
  );
  return {
    env: { PATH: `${bin}:${process.env.PATH}` },
    calls: () => (existsSync(log) ? readFileSync(log, "utf8") : ""), // calls.txt
  };
};

describe("the scripted fresh agent session", () => {
  const roadmap = parseRoadmap(git(ROOT, "show", "HEAD:ROADMAP.md")).slices;
  const cur = currentSlice(roadmap);
  const item = nextItem(cur)?.text.split(/:\s/)[0] ?? "";
  /** Answers each scripted question as the repo's rules ask; on "dark mode" it first runs `onDarkMode`. */
  const session = (onDarkMode = ":") =>
    standIn([
      {
        when: "/ready",
        say: "It checks only the READY_TOKEN bearer token, then answers ok; the database checks are not built yet.",
      },
      {
        when: "dark mode",
        first: onDarkMode,
        say: "off-roadmap PR, or replan?",
      },
      { say: `We are on Slice ${cur?.n}, item: ${item}.` },
    ]);

  it("waits on Devesh's evals key, naming the Waiting item, and starts no session without it", async () => {
    const claude = session();
    const [r] = await prove([agentSession], ROOT, claude.env);
    expect(r?.outcome).toBe("waiting");
    expect(r?.seen).toContain(KEY);
    expect(claude.calls()).toBe("");
  });

  it("with the key, holds four exchanges in one session in a fresh clone of main, with only that key and a home of its own, and saves the transcript", async () => {
    const claude = session();
    const [r] = await prove([agentSession], ROOT, {
      ...claude.env,
      ANTHROPIC_EVALS_KEY: "evals-key-for-tests",
      GH_TOKEN: "never-handed-on",
      ANTHROPIC_API_KEY: "another-key",
    });
    expect(r?.seen).not.toContain("✗");
    expect(r?.outcome).toBe("passed");
    expect(r?.files).toEqual(["1-agent-session.txt", "1-agent-session.jsonl"]);
    const calls = claude.calls();
    expect(calls.match(/^args: /gm)?.length).toBe(4);
    expect(calls.match(/^key: evals-key-for-tests$/gm)?.length).toBe(4);
    expect(calls).not.toContain("another-key");
    expect(calls).toContain("gh: none");
    expect(calls).not.toContain(`home: ${process.env.HOME}\n`);
    expect(calls).not.toContain(`cwd: ${ROOT}\n`);
    expect(calls.match(/--resume stand-in/g)?.length).toBe(3);
  });

  it("fails, naming the branch, when the session makes one on 'add a dark mode to the console'", async () => {
    const claude = session("git checkout -qb feat/dark-mode");
    const [r] = await prove([agentSession], ROOT, {
      ...claude.env,
      ANTHROPIC_EVALS_KEY: "evals-key-for-tests",
    });
    expect(r?.outcome).toBe("failed");
    expect(r?.seen).toContain("feat/dark-mode");
  });
});

describe("the verifier's run on a change missing a cross-company test", () => {
  const verifier = (ruling: string) =>
    standIn([{ say: `I ran its test.\n${ruling}` }]);

  it("waits on Devesh's evals key without it", async () => {
    const claude = verifier("Ruling: PASS — x");
    const [r] = await prove([crossCompany], ROOT, claude.env);
    expect(r?.outcome).toBe("waiting");
    expect(claude.calls()).toBe("");
  });

  it("passes when the verifier, started as the verifier agent with only the evals key, rules FAIL for the other company", async () => {
    const claude = verifier(
      "Ruling: FAIL — no test asks for another company's open tasks; add a cross-company test",
    );
    const [r] = await prove([crossCompany], ROOT, {
      ...claude.env,
      ANTHROPIC_EVALS_KEY: "evals-key-for-tests",
    });
    expect(r?.outcome).toBe("passed");
    expect(r?.files).toEqual(["1-verifier.txt", "1-verifier.jsonl"]);
    const calls = claude.calls();
    expect(calls).toContain("--agent verifier");
    expect(calls).toContain("key: evals-key-for-tests");
  });

  it("fails when the verifier passes it", async () => {
    const claude = verifier("Ruling: PASS — the count is right");
    const [r] = await prove([crossCompany], ROOT, {
      ...claude.env,
      ANTHROPIC_EVALS_KEY: "evals-key-for-tests",
    });
    expect(r?.outcome).toBe("failed");
    expect(r?.seen).toContain("PASS");
  });
});

describe("GitHub's run records: the cloud test database changes only after checks pass", () => {
  const at = (m: number) => `2026-10-03T07:${String(m).padStart(2, "0")}:00Z`;
  const staging = (sha: string, start: number, apply: string) => ({
    url: `https://example.invalid/runs/${sha}`,
    sha,
    jobs: [
      {
        name: "staging-migrations",
        conclusion: "success",
        startedAt: at(start),
        steps: [{ name: "Apply migrations to staging", conclusion: apply }],
      },
    ],
  });
  const ci = (sha: string, done: number, conclusion = "success") => ({
    sha,
    jobs: [{ name: "checks", conclusion, completedAt: at(done) }],
  });
  const touches = (sha: string) => sha.startsWith("m");

  it("passes when each run started after checks passed on its commit and skipped the apply step with no migration changed", () => {
    expect(
      runRecordProblems(
        [staging("a1", 10, "skipped"), staging("m1", 20, "success")],
        [ci("a1", 9), ci("m1", 19)],
        touches,
      ),
    ).toEqual([]);
  });

  it("names a run that started before checks passed, one with no passed checks, one that applied with no migration changed, and a window with no skip", () => {
    const problems = runRecordProblems(
      [
        staging("a1", 10, "success"),
        staging("m1", 20, "success"),
        staging("a2", 30, "skipped"),
      ],
      [ci("a1", 9), ci("m1", 21), ci("a2", 29, "failure")],
      touches,
    ).join("\n");
    expect(problems).toContain("a1 changed no migration");
    expect(problems).toContain("before `checks` passed on m1");
    expect(problems).toContain("`checks` did not pass on a2");
    expect(
      runRecordProblems(
        [staging("m1", 20, "success")],
        [ci("m1", 19)],
        touches,
      ).join("\n"),
    ).toContain("no run on a commit that changed no migration");
    expect(runRecordProblems([], [], touches).join("\n")).toContain(
      "no run of staging-migrations",
    );
  });

  it("does not hold a run whose job was skipped, which never reached the cloud", () => {
    const skipped = {
      ...staging("b1", 40, "skipped"),
      jobs: [
        {
          name: "staging-migrations",
          conclusion: "skipped",
          startedAt: at(40),
          steps: [],
        },
      ],
    };
    expect(
      runRecordProblems(
        [skipped, staging("a1", 10, "skipped")],
        [ci("b1", 39, "failure"), ci("a1", 9)],
        touches,
      ),
    ).toEqual([]);
  });
});
