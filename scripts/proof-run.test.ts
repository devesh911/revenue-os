// `bun run proof <slice>` runs a slice's proof steps in order (scripts/proof/run.ts) and gives each one passed,
// failed or waiting (on something STATE.md → Waiting on Devesh names); here, with stand-in steps, and Slice 0's first
// step run as the command runs it.
import {
  afterAll,
  describe,
  expect,
  it,
  setDefaultTimeout,
  setSystemTime,
} from "bun:test";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { overall, RUN_MINUTES, runSteps } from "./proof/run";
import { sh } from "./proof/scratch";
import { steps as slice0 } from "./proof/slice-0";
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

  it("runs each step's clean-up once the step ends, also when it ran past its time, before the next step", async () => {
    const order: string[] = [];
    const results = await run([
      {
        does: "hangs, having started something outside the run",
        minutes: 0.001,
        check: () => new Promise<string>(() => {}),
        cleanUp: () => {
          order.push("hung step cleaned up");
        },
      },
      {
        does: "passes",
        check: () => {
          order.push("next step ran");
          return "ok";
        },
        cleanUp: () => {
          order.push("passed step cleaned up");
        },
      },
    ]);
    expect(results.map((r) => r.outcome)).toEqual(["failed", "passed"]);
    expect(order).toEqual([
      "hung step cleaned up",
      "next step ran",
      "passed step cleaned up",
    ]);
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

  it("gives a run 100 minutes unless told otherwise, so it stops in time to write its report before proof.yml's job limit", async () => {
    const job = (
      Bun.YAML.parse(
        readFileSync(join(ROOT, ".github/workflows/proof.yml"), "utf8"),
      ) as { jobs: { proof: { "timeout-minutes"?: number } } }
    ).jobs.proof["timeout-minutes"];
    expect(job).toBeGreaterThanOrEqual(RUN_MINUTES + 15); // the job's setup and the report's upload come on top
    try {
      const results = await run([
        {
          does: "takes the run's whole time",
          check: () => {
            setSystemTime(new Date(Date.now() + RUN_MINUTES * 60_000));
            return "done";
          },
        },
        { does: "comes after", check: () => "ran" },
      ]);
      expect(results[1]).toMatchObject({
        outcome: "failed",
        seen: `the run's time ran out (${RUN_MINUTES} minutes) before this step started`,
      });
    } finally {
      setSystemTime(); // the real clock again
    }
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

describe("Slice 0's steps", () => {
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
