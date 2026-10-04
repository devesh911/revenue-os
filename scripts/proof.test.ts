// `bun run proof <slice>` (scripts/proof/) runs a slice's proof steps in order and gives each one passed, failed or
// waiting (on something STATE.md → Waiting on Devesh names), writes a short report, and exits 1 only when a step
// failed. .github/workflows/proof.yml runs it after each deploy to main, once a day and by hand, and posts each
// report to the "Proof reports" issue; its posting step runs here as GitHub runs it, with a stand-in `gh`.
import { afterAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { secondCheck } from "./done-gate/pr";
import { ALL_PASSED, reportHeading } from "./done-gate/proof-run";
import { prove } from "./proof/cli";
import { dueSlices } from "./proof/due";
import { reportText } from "./proof/report";
import { overall, RUN_MINUTES, runSteps } from "./proof/run";
import { sh } from "./proof/scratch";
import { steps as slice0 } from "./proof/slice-0";
import { SLICES } from "./proof/slices";
import { type Step, WaitingOn } from "./proof/step";

setDefaultTimeout(30_000);
const ROOT = join(import.meta.dir, "..");
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const scratch = (name: string) => {
  const dir = mkdtempSync(join(tmpdir(), name));
  dirs.push(dir);
  return dir;
};

const KEY = "A second Anthropic key for the automatic test conversations";
const STATE = `PHASE: SETUP\n\n## What works today\n| Area | Capability | Status | Where / why |\n|---|---|---|---|\n| Data | x | Works | y |\n## Waiting on Devesh\n- [ ] **${KEY}**: a key saved in GitHub as ANTHROPIC_EVALS_KEY\n- [x] **Pin the required checks** (done 2026-10-02)\n## Decisions in force\n`;
const needsKey = { item: KEY, arrived: (env: NodeJS.ProcessEnv) => !!env.KEY };
const run = (steps: Step[], env: NodeJS.ProcessEnv = {}) =>
  runSteps(steps, { root: ROOT, env, state: STATE, dir: scratch("proof-") });

describe("running a slice's steps", () => {
  it("runs every step in order: one that returns passed with what it saw, one that throws failed, and later steps still run", async () => {
    const order: string[] = [];
    const results = await run([
      {
        does: "first",
        check: () => {
          order.push("1");
          return "saw one";
        },
      },
      {
        does: "second",
        check: () => {
          order.push("2");
          throw new Error("saw two");
        },
      },
      {
        does: "third",
        check: async () => {
          order.push("3");
          return "saw three";
        },
      },
    ]);
    expect(order).toEqual(["1", "2", "3"]);
    expect(results.map((r) => [r.does, r.outcome, r.seen])).toEqual([
      ["first", "passed", "saw one"],
      ["second", "failed", "saw two"],
      ["third", "passed", "saw three"],
    ]);
  });

  it("a step needing a Waiting item that has not arrived waits, naming it, and its check never runs", async () => {
    let ran = false;
    const [r] = await run([
      {
        does: "talks to a model",
        needs: [needsKey],
        check: () => {
          ran = true;
          return "x";
        },
      },
    ]);
    expect(ran).toBe(false);
    expect(r?.outcome).toBe("waiting");
    expect(r?.seen).toContain(KEY);
    const [arrived] = await run(
      [
        {
          does: "talks to a model",
          needs: [needsKey],
          check: () => "answered",
        },
      ],
      { KEY: "set" },
    );
    expect(arrived?.outcome).toBe("passed");
  });

  it("fails, not waits, when STATE.md says the item was delivered or names no such item", async () => {
    const [delivered, unknown] = await run([
      {
        does: "a",
        needs: [{ item: "Pin the required checks", arrived: () => false }],
        check: () => "x",
      },
      {
        does: "b",
        needs: [{ item: "A pony", arrived: () => false }],
        check: () => "x",
      },
    ]);
    expect(delivered?.outcome).toBe("failed");
    expect(delivered?.seen).toContain("ticked as delivered");
    expect(unknown?.outcome).toBe("failed");
    expect(unknown?.seen).toContain("no item");
  });

  it("fails a step that runs past its time", async () => {
    const [r] = await run([
      {
        does: "hangs",
        minutes: 0.001,
        check: () => new Promise<string>(() => {}),
      },
    ]);
    expect(r?.outcome).toBe("failed");
    expect(r?.seen).toContain("did not finish");
  });

  it("stops a command a step runs when the step's time is up, and fails the step", async () => {
    const started = Date.now();
    const [r] = await run([
      {
        does: "sleeps",
        minutes: 0.02, // 1.2 seconds
        check: () => {
          sh(ROOT, ["sleep", "6"]);
          return "finished";
        },
      },
    ]);
    expect(Date.now() - started).toBeLessThan(4000);
    expect(r?.outcome).toBe("failed");
    expect(r?.seen).toContain("did not finish in 0.02 minute(s)");
  });

  it("never reports as passed a step that ran past its time, even one that blocked the whole while", async () => {
    const [r] = await run([
      {
        does: "blocks",
        minutes: 0.01,
        check: () => {
          spawnSync("sleep", ["2"]);
          return "finished";
        },
      },
    ]);
    expect(r?.outcome).toBe("failed");
    expect(r?.seen).toContain("did not finish");
  });

  it("stops the run when its own time is up, so the report is written before the proof job's limit", async () => {
    const results = await runSteps(
      [
        {
          does: "sleeps",
          check: () => {
            sh(ROOT, ["sleep", "6"]);
            return "finished";
          },
        },
        { does: "comes after", check: () => "ran" },
      ],
      {
        root: ROOT,
        env: {},
        state: STATE,
        dir: scratch("proof-"),
        minutes: 0.02,
      },
    );
    expect(results.map((r) => r.outcome)).toEqual(["failed", "failed"]);
    expect(results[1]?.seen).toContain("the run's time ran out");
  });

  it("a step that finds what it needs from Devesh unusable while it runs waits on it, naming it", async () => {
    const [r] = await run([
      {
        does: "talks to a model",
        check: () => {
          throw new WaitingOn(`"${KEY}": its spending limit is used up`);
        },
      },
    ]);
    expect(r?.outcome).toBe("waiting");
    expect(r?.seen).toContain(KEY);
  });

  it("keeps the files a step writes into the report folder, and refuses a name that leaves it", async () => {
    const dir = scratch("proof-files-");
    const [kept, refused] = await runSteps(
      [
        {
          does: "records a transcript",
          check: ({ file }) => {
            writeFileSync(file("transcript.txt"), "hello");
            file("never-written.png");
            return "recorded";
          },
        },
        { does: "escapes", check: ({ file }) => file("../x") },
      ],
      { root: ROOT, env: {}, state: STATE, dir },
    );
    expect(kept?.files).toEqual(["1-transcript.txt"]);
    expect(readFileSync(join(dir, "1-transcript.txt"), "utf8")).toBe("hello");
    expect(refused?.outcome).toBe("failed");
  });

  it("the slice passes when every step passed, waits when the rest only wait, and fails when any failed", () => {
    const r = (outcome: "passed" | "failed" | "waiting") => ({
      does: "x",
      outcome,
      seen: "",
      files: [],
    });
    expect(overall([r("passed"), r("passed")])).toBe("passed");
    expect(overall([r("passed"), r("waiting")])).toBe("waiting");
    expect(overall([r("waiting"), r("failed")])).toBe("failed");
    expect(overall([])).toBe("failed");
  });
});

describe("the report", () => {
  it("opens with the heading rules-from-main looks for, then the run, then each step with what it saw", () => {
    const text = reportText(
      0,
      [
        {
          does: "checks A",
          outcome: "passed",
          seen: "A is there",
          files: ["1-a.png"],
        },
        {
          does: "checks B",
          outcome: "waiting",
          seen: `waits on Devesh: "${KEY}"`,
          files: [],
        },
      ],
      {
        run: "https://github.com/o/r/actions/runs/1",
        commit: "abcdef0123",
        date: "2026-10-05",
      },
    );
    const lines = text.split("\n");
    expect(lines[0]).toBe(reportHeading(0, "waiting"));
    expect(lines[1]).toBe(
      "Run: https://github.com/o/r/actions/runs/1 · commit abcdef0 · 2026-10-05",
    );
    expect(text).toContain("1. ✓ passed: checks A");
    expect(text).toContain("Seen: A is there");
    expect(text).toContain("1-a.png");
    expect(text).toContain("2. … waiting: checks B");
    expect(text).toContain("stay as they are");
  });

  it("fits in one GitHub comment however long and many-lined the steps' texts are", () => {
    const long = `${"a line of output\n".repeat(400)}`;
    const text = reportText(
      0,
      Array.from({ length: 40 }, () => ({
        does: "x".repeat(5000),
        outcome: "failed" as const,
        seen: long,
        files: [],
      })),
      { commit: "abcdef0", date: "2026-10-05" },
    );
    expect(text.length).toBeLessThanOrEqual(65_536);
    expect(text.split("\n")[0]).toBe(reportHeading(0, "failed"));
  });
});

describe("bun run proof <slice>", () => {
  const steps = (failing: boolean): Step[] => [
    { does: "passes", check: () => "fine" },
    { does: "needs the key", needs: [needsKey], check: () => "x" },
    ...(failing
      ? [
          {
            does: "fails",
            check: () => {
              throw new Error("saw the wrong thing");
            },
          },
        ]
      : []),
  ];
  /** Proves slice `n` as the command does, into a scratch folder, with GITHUB_OUTPUT as the proof workflow sets it. */
  const proved = async (n: number, list: Step[] | undefined) => {
    const dir = scratch("proof-cli-");
    const output = join(dir, "github-output");
    writeFileSync(output, "");
    const r = await prove(n, list, {
      root: dir,
      env: {
        GITHUB_OUTPUT: output,
        GITHUB_SERVER_URL: "https://github.com",
        GITHUB_REPOSITORY: "o/r",
        GITHUB_RUN_ID: "9",
      },
      state: STATE,
      dir: join(dir, "report"),
    });
    return {
      ...r,
      report: readFileSync(join(dir, "report", "report.md"), "utf8"),
      output: readFileSync(output, "utf8"),
    };
  };

  it("exits 1 when a step failed, writes report.md naming the run, and tells the workflow the result", async () => {
    const r = await proved(0, steps(true));
    expect(r.code).toBe(1);
    expect(r.report).toBe(r.text);
    expect(r.report.split("\n").slice(0, 2)).toEqual([
      reportHeading(0, "failed"),
      expect.stringMatching(
        /^Run: https:\/\/github\.com\/o\/r\/actions\/runs\/9 · commit \w+ · \d{4}-\d{2}-\d{2}$/,
      ),
    ]);
    expect(r.report).toContain("saw the wrong thing");
    expect(r.output).toBe("result=failed\n");
  });

  it("exits 0 when the only steps not passed wait on Devesh, listing them", async () => {
    const r = await proved(0, steps(false));
    expect(r.code).toBe(0);
    expect(r.report).toContain(KEY);
    expect(r.output).toBe("result=waiting\n");
  });

  it("fails a slice that has no steps yet", async () => {
    const r = await proved(1, undefined);
    expect(r.code).toBe(1);
    expect(r.report).toContain("has no proof steps");
    expect(r.output).toBe("result=failed\n");
  });

  it("refuses a slice ROADMAP.md does not have, and anything but a slice number", () => {
    const run = (...args: string[]) =>
      spawnSync("bun", ["run", "proof", ...args], {
        cwd: ROOT,
        encoding: "utf8",
      });
    const unknown = run("99");
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain("ROADMAP.md has no Slice 99");
    expect(run().status).toBe(2);
    expect(run("0", "--elsewhere").status).toBe(2);
  });
});

describe("Slice 0's steps", () => {
  it("are the ones `bun run proof 0` runs", () => {
    expect(SLICES[0]).toBe(slice0);
  });

  it("its first step passes on this checkout: the four law files exist and the parser reads them with no problems", async () => {
    const [first] = await runSteps(slice0.slice(0, 1), {
      root: ROOT,
      env: {},
      state: readFileSync(join(ROOT, "STATE.md"), "utf8"),
      dir: scratch("proof-0-"),
    });
    expect(first?.outcome).toBe("passed");
    expect(first?.seen).toContain("no problems");
  });

  it("its first step fails where a law file is missing or ROADMAP.md is malformed", async () => {
    const dir = scratch("proof-0-bad-");
    mkdirSync(join(dir, "docs"));
    for (const f of ["AGENTS.md", "docs/NORTH-STAR.md", "STATE.md"])
      writeFileSync(join(dir, f), "x\n");
    const [first] = await runSteps(slice0.slice(0, 1), {
      root: dir,
      env: {},
      state: "",
      dir: scratch("proof-0-out-"),
    });
    expect(first?.outcome).toBe("failed");
    expect(first?.seen).toContain("ROADMAP.md");
  });
});

describe("which slices a proof run proves", () => {
  const roadmap = (statuses: string[]) =>
    `# Roadmap\n\n${statuses.map((s, n) => `## Slice ${n}: T\nStatus: ${s}\nGoal: g\nProof: p\nBlocked by: nothing\nProof passed: ${s === "done" ? "2026-10-05" : "—"}\n`).join("\n")}`;

  it("every slice that is proof ready or done, or the one given by hand whatever its status", () => {
    const md = roadmap(["done", "proof ready", "in progress", "not started"]);
    expect(dueSlices(md)).toEqual([0, 1]);
    expect(dueSlices(md, "")).toEqual([0, 1]);
    expect(dueSlices(md, "3")).toEqual([3]);
    expect(() => dueSlices(md, "7")).toThrow("no Slice 7");
    expect(() => dueSlices(md, "1; rm -rf /")).toThrow("a slice number");
  });

  it("tells the workflow as `slices=[…]`, run as its step runs it", () => {
    const step = (workflow().jobs.due?.steps ?? []).find((s) => s.id === "due");
    expect(step?.env).toEqual({ SLICE: expr("inputs.slice") });
    const output = join(scratch("proof-due-"), "out");
    writeFileSync(output, "");
    const r = spawnSync("bash", ["-e", "-c", step?.run ?? "false"], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, GITHUB_OUTPUT: output, SLICE: "0" },
    });
    expect(r.status).toBe(0);
    expect(readFileSync(output, "utf8")).toBe("slices=[0]\n");
  });
});

type Step_ = {
  id?: string;
  name?: string;
  uses?: string;
  if?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
  run?: string;
};
type Job = {
  if?: string;
  needs?: unknown;
  permissions?: unknown;
  strategy?: { matrix?: Record<string, unknown>; "fail-fast"?: boolean };
  outputs?: Record<string, string>;
  steps?: Step_[];
};
const WORKFLOW = join(ROOT, ".github", "workflows", "proof.yml");
/** A GitHub expression, as the workflow file writes it. */
const expr = (s: string) => `\${{ ${s} }}`;
const workflow = () =>
  Bun.YAML.parse(readFileSync(WORKFLOW, "utf8")) as {
    name: string;
    "run-name": string;
    on: Record<string, unknown>;
    permissions: unknown;
    jobs: Record<string, Job>;
  };

describe("proof.yml: the proof runs on GitHub after each deploy to main, once a day and by hand", () => {
  it("starts after deploy finishes on a push to main, on a daily schedule and by hand with a slice; never for a pull request", () => {
    const w = workflow();
    expect(Object.keys(w.on).sort()).toEqual([
      "schedule",
      "workflow_dispatch",
      "workflow_run",
    ]);
    expect(w.on.workflow_run).toEqual({
      workflows: ["deploy"],
      types: ["completed"],
      branches: ["main"],
    });
    expect(w.on.schedule).toEqual([{ cron: expect.any(String) }]);
    expect(
      (w.on.workflow_dispatch as { inputs: Record<string, unknown> }).inputs
        .slice,
    ).toMatchObject({ required: true });
    expect(w.jobs.due?.if?.replace(/\s+/g, " ").trim()).toBe(
      "github.event_name == 'schedule' || (github.event_name == 'workflow_run' && github.event.workflow_run.event == 'push' && contains(fromJSON('[\"success\",\"skipped\"]'), github.event.workflow_run.conclusion)) || (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main')",
    );
  });

  it("names each run so its slice can be read back", () => {
    expect(workflow()["run-name"]).toBe(
      expr(
        "github.event_name == 'workflow_dispatch' && format('Proof of Slice {0}', inputs.slice) || format('Proof of every proof-ready or done slice ({0})', github.event_name)",
      ),
    );
  });

  it("holds the least permissions each job needs, pins every action by commit, and passes values as environment variables", () => {
    const w = workflow();
    expect(w.permissions).toEqual({});
    expect(w.jobs.due?.permissions).toEqual({ contents: "read" });
    expect(w.jobs.proof?.permissions).toEqual({
      contents: "read",
      actions: "read",
    });
    expect(w.jobs.post?.permissions).toEqual({ issues: "write" });
    for (const job of Object.values(w.jobs))
      for (const s of job.steps ?? []) {
        if (s.uses) expect(s.uses).toMatch(/@[0-9a-f]{40}$/);
        expect(s.run ?? "").not.toContain(`\${{`);
      }
    expect(
      secondCheck({
        ".github/workflows/proof.yml": readFileSync(WORKFLOW, "utf8"),
      }),
    ).toEqual([]);
  });

  it("proves each due slice in its own job: the local stack for Slices 0 and 1, the AI key only where the proof runs, the report kept as the run's artifact", () => {
    const proof = workflow().jobs.proof as Job;
    expect(proof.needs).toBe("due");
    expect(proof.strategy).toEqual({
      "fail-fast": false,
      matrix: { slice: expr("fromJSON(needs.due.outputs.slices)") },
    });
    const steps = proof.steps ?? [];
    const prove = steps.find((s) => s.id === "prove") as Step_;
    expect(prove.run?.trim()).toBe('bun run proof "$SLICE" --out proof-report');
    expect(prove.env).toEqual({
      SLICE: expr("matrix.slice"),
      ANTHROPIC_EVALS_KEY: expr("secrets.ANTHROPIC_EVALS_KEY"),
      GH_TOKEN: expr("github.token"),
    });
    for (const s of steps)
      if (s !== prove)
        expect(JSON.stringify(s.env ?? {})).not.toContain("secrets.");
    const start = steps.find((s) => /supabase start/.test(s.run ?? ""));
    expect(start?.if).toBe("matrix.slice <= 1");
    const passed = steps.find((s) => s.name === ALL_PASSED);
    expect(passed?.if).toBe("steps.prove.outputs.result == 'passed'");
    // The verifier's run in Slice 0's proof runs the whole gate, browser checks included, as ci.yml installs them.
    const browsers = steps.findIndex((s) =>
      /playwright install --with-deps chromium/.test(s.run ?? ""),
    );
    expect(browsers).toBeGreaterThan(-1);
    expect(browsers).toBeLessThan(steps.indexOf(prove));
    expect(steps[browsers]?.if).toBe("matrix.slice <= 1");
    // The run stops its steps in time to write its report before the job's limit, setup included.
    expect(
      (proof as { "timeout-minutes"?: number })["timeout-minutes"],
    ).toBeGreaterThanOrEqual(RUN_MINUTES + 15);
    const upload = steps.find((s) =>
      s.uses?.startsWith("actions/upload-artifact@"),
    );
    expect(upload?.if).toBe("always()");
    expect(upload?.with).toMatchObject({
      name: `proof-slice-${expr("matrix.slice")}`,
      path: "proof-report",
    });
  });

  describe('posting each report to the one standing "Proof reports" issue', () => {
    const post = () =>
      (workflow().jobs.post?.steps ?? []).find((s) =>
        /gh issue/.test(s.run ?? ""),
      ) as Step_;
    /** Runs the posting step as GitHub would, in a folder holding the downloaded reports, with a stand-in gh. */
    const posted = (issues: string, reports: Record<number, string>) => {
      const dir = scratch("proof-post-");
      const bin = join(dir, "bin");
      mkdirSync(bin);
      writeFileSync(
        join(bin, "gh"),
        `#!/bin/bash
echo "gh $*" >> "$LOG"
case "$1 $2" in
  "issue list") printf '%s' "$ISSUES" ;;
  "issue create") echo "https://github.com/o/r/issues/42" ;;
  "issue comment") shift 2; while [ $# -gt 0 ]; do [ "$1" = --body-file ] && { grep -q UNPOSTABLE "$2" && exit 1; echo "--- comment"; cat "$2"; } >> "$LOG"; shift; done ;;
esac
`,
        { mode: 0o755 },
      );
      for (const [n, text] of Object.entries(reports)) {
        mkdirSync(join(dir, "reports", `proof-slice-${n}`), {
          recursive: true,
        });
        writeFileSync(
          join(dir, "reports", `proof-slice-${n}`, "report.md"),
          text,
        );
      }
      const log = join(dir, "log");
      const r = spawnSync("bash", ["-e", "-c", post().run ?? ""], {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          LOG: log,
          ISSUES: issues,
          SLICES: "[0,1]",
          RUN_URL: "https://github.com/o/r/actions/runs/9",
          OWNER: "devesh911",
        },
      });
      return {
        status: r.status,
        log: existsSync(log) ? readFileSync(log, "utf8") : "",
      };
    };

    it("comments each report on the existing issue, and says so when a slice's job wrote none", () => {
      const r = posted("12", {
        0: "## Proof report: Slice 0 — passed\nall good\n",
      });
      expect(r.status).toBe(0);
      expect(r.log).not.toContain("gh issue create");
      expect(r.log).toContain("gh issue comment 12");
      expect(r.log).toContain("all good");
      expect(r.log).toContain(
        `${reportHeading(1, "failed")}\nRun: https://github.com/o/r/actions/runs/9`,
      );
    });

    it("still posts the other slices' reports when one can't be posted, then fails the step", () => {
      const r = posted("12", {
        0: "## Proof report: Slice 0 — failed\nUNPOSTABLE\n",
        1: "## Proof report: Slice 1 — passed\nslice one's report\n",
      });
      expect(r.status).not.toBe(0);
      expect(r.log).toContain("slice one's report");
    });

    it("creates the issue when it is missing, mentioning Devesh so GitHub notifies him of every report", () => {
      const r = posted("", { 0: "r0\n", 1: "r1\n" });
      expect(r.status).toBe(0);
      expect(r.log).toMatch(
        /gh issue create --title Proof reports --body .*@devesh911/,
      );
      expect(r.log).toContain("gh issue comment 42");
    });
  });
});
