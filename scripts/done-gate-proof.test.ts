// rules-from-main (`bun run gate pr`) refuses a pull request that sets a slice to `done` unless its `Proof passed:`
// link is a run of the proof workflow (.github/workflows/proof.yml), for that slice, that GitHub's API reports
// concluded success with every step passed, on a commit already on main; every item of the slice is ticked; and its
// body shows that run's report heading and `Run:` line. A done slice that keeps its link keeps its fields and items.
// GitHub's API is a stand-in server here, answering as GitHub answers (the run and its jobs, or 404).
import { afterAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { proofLinkProblems } from "./done-gate/proof-link";
import { reportHeading, sliceOutcome } from "./done-gate/proof-run";

setDefaultTimeout(30_000);
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const REPO = "devesh911/revenue-os";
const ID = "18234567890";
const LINK = `https://github.com/${REPO}/actions/runs/${ID}`;
const SHA = "a".repeat(40);
const slice = (status: string, passed = "—") =>
  `# Roadmap\n\n## Slice 0: Ground\nStatus: ${status}\nGoal: g\nProof: p\nBlocked by: nothing\nProof passed: ${passed}\n\n- [x] A (agent) · evidence: [#1](https://example.com)\n`;
const MAIN = slice("proof ready");
const DONE = slice("done", `2026-10-05 · [run ${ID}](${LINK})`);
const REPORT = `${reportHeading(0, "passed")}\nRun: ${LINK} · commit aaaaaaa · 2026-10-05\nEvery step passed.\n\n1. ✓ passed: the four law files exist\n`;
const BODY = `Roadmap: Slice 0 — replan: Slice 0's proof passed\n\n${REPORT}`;

type Run = Record<string, unknown>;
const run = (over: Run = {}): Run => ({
  id: Number(ID),
  path: ".github/workflows/proof.yml",
  status: "completed",
  conclusion: "success",
  head_sha: SHA,
  created_at: "2026-10-05T03:23:11Z",
  html_url: LINK,
  ...over,
});
const passedJob = (n = 0, allPassed = "success") => ({
  name: `proof (${n})`,
  status: "completed",
  conclusion: "success",
  steps: [
    { name: `Prove Slice ${n}`, conclusion: "success" },
    { name: "Every step passed", conclusion: allPassed },
  ],
});

/** GitHub's API as the check asks it: the run, then its jobs; every path it asked is kept. */
const github = (r: Run = run(), jobs: unknown[] = [passedJob()]) => {
  const asked: string[] = [];
  const ask = async (path: string) => {
    asked.push(path);
    if (path === `repos/${REPO}/actions/runs/${ID}`) return r;
    if (path.startsWith(`repos/${REPO}/actions/runs/${ID}/jobs`))
      return { total_count: jobs.length, jobs };
    throw new Error(`GitHub's API answered 404 for ${path}`);
  };
  return { asked, ask };
};
const judge = (
  over: Partial<Parameters<typeof proofLinkProblems>[0]> = {},
  gh = github(),
) =>
  proofLinkProblems({
    now: DONE,
    main: MAIN,
    body: BODY,
    repo: REPO,
    ask: gh.ask,
    onMain: (sha) => sha === SHA,
    ...over,
  });

describe("what a proof run says about one slice, read from its jobs", () => {
  it("passed only when that slice's job succeeded and ran its every-step-passed step; waiting when it skipped it", () => {
    expect(sliceOutcome([passedJob()], 0)).toBe("passed");
    expect(sliceOutcome([passedJob(0, "skipped")], 0)).toBe("waiting");
    expect(sliceOutcome([{ ...passedJob(), conclusion: "failure" }], 0)).toBe(
      "failed",
    );
    expect(sliceOutcome([{ ...passedJob(), status: "in_progress" }], 0)).toBe(
      "running",
    );
    expect(sliceOutcome([passedJob(1)], 0)).toBeUndefined();
  });
});

describe("a pull request that sets a slice to done", () => {
  it("passes with a passing run of the proof workflow for that slice, on main, and its report in the body", async () => {
    const gh = github();
    expect(await judge({}, gh)).toEqual([]);
    expect(gh.asked).toEqual([
      `repos/${REPO}/actions/runs/${ID}`,
      `repos/${REPO}/actions/runs/${ID}/jobs?filter=latest&per_page=100`,
    ]);
  });

  it("asks GitHub nothing when no slice becomes done, or a done slice keeps its link", async () => {
    const gh = github();
    expect(await judge({ now: MAIN }, gh)).toEqual([]);
    expect(await judge({ main: DONE, body: "Roadmap: x" }, gh)).toEqual([]);
    expect(gh.asked).toEqual([]);
  });

  it("checks a done slice again when its link changes", async () => {
    const was = slice("done", `2026-10-01 · [run 1](${LINK.replace(ID, "1")})`);
    const gh = github(run({ conclusion: "failure" }));
    expect(await judge({ main: was }, gh)).toEqual([
      expect.stringContaining("concluded failure"),
    ]);
  });

  it("refuses a done slice changed while it keeps its link: its title, its Proof line or its items, asking GitHub nothing", async () => {
    const gh = github();
    const rewritten = DONE.replace("Ground", "Ground, renamed")
      .replace("Proof: p", "Proof: a weaker proof")
      .concat("- [ ] b (agent)\n- [ ] c, never proved (agent)\n");
    const problems = await judge({ main: DONE, now: rewritten }, gh);
    expect(problems).toContainEqual(
      expect.stringContaining("changes Slice 0, which is done"),
    );
    expect(gh.asked).toEqual([]);
    for (const now of [
      DONE.replace("Proof: p", "Proof: a weaker proof"),
      DONE.replace("- [x] A", "- [ ] A"),
      `${DONE}- [x] B (agent) · evidence: x\n`,
    ])
      expect(await judge({ main: DONE, now }, gh)).toEqual([
        expect.stringContaining("changes Slice 0, which is done"),
      ]);
  });

  it("lets a done slice keep its link while a ticked item gains evidence", async () => {
    const more = DONE.replace(
      "evidence: [#1](https://example.com)",
      "evidence: [#1](https://example.com), and seen again in [#2](https://example.com/2)",
    );
    expect(await judge({ main: DONE, now: more })).toEqual([]);
  });

  it("refuses a slice set to done that still has an unticked item", async () => {
    expect(await judge({ now: `${DONE}- [ ] b (agent)\n` })).toEqual([
      expect.stringContaining('its item "b (agent)" is not ticked'),
    ]);
  });

  it("refuses a missing, foreign or malformed link, and a date that is not the run's", async () => {
    const cases: [string, string][] = [
      ["2026-10-05", "has no link to a proof run"],
      [`2026-10-05 · ${LINK.replace(REPO, "someone/fork")}`, "not this one"],
      [`2026-10-05 · ${LINK} and ${LINK.replace(ID, "2")}`, "exactly one"],
      [`2026-10-05 · ${LINK}/attempts/2`, "has no link to a proof run"],
      [`2026-10-06 · [run ${ID}](${LINK})`, "started on 2026-10-05"],
    ];
    for (const [passed, why] of cases)
      expect(await judge({ now: slice("done", passed) })).toEqual([
        expect.stringContaining(why),
      ]);
  });

  it("refuses a run of another workflow, one that did not succeed, and one not on main", async () => {
    const cases: [Run, string][] = [
      [run({ path: ".github/workflows/ci.yml" }), "not of the proof workflow"],
      [run({ conclusion: "failure" }), "concluded failure"],
      [run({ status: "in_progress", conclusion: null }), "still in_progress"],
      [run({ head_sha: "b".repeat(40) }), "not on main"],
    ];
    for (const [r, why] of cases)
      expect(await judge({}, github(r))).toEqual([
        expect.stringContaining(why),
      ]);
  });

  it("refuses a run that did not prove that slice, or left a step waiting", async () => {
    expect(await judge({}, github(run(), [passedJob(1)]))).toEqual([
      expect.stringContaining("did not prove Slice 0"),
    ]);
    expect(await judge({}, github(run(), [passedJob(0, "skipped")]))).toEqual([
      expect.stringContaining("left a step waiting"),
    ]);
  });

  it("refuses a body that does not carry the run's report", async () => {
    for (const body of [
      "Roadmap: Slice 0 — replan: done",
      BODY.replace(LINK, LINK.replace(ID, "2")),
      BODY.replace("— passed", "— waiting"),
      `Roadmap: x\n<!--\n${REPORT}-->`,
    ])
      expect(await judge({ body })).toEqual([
        expect.stringContaining("carries no report"),
      ]);
  });

  it("refuses, saying why, when GitHub can't be asked or this repository can't be told", async () => {
    expect(
      await judge({
        ask: async () => {
          throw new Error("GitHub's API answered 404");
        },
      }),
    ).toEqual([expect.stringContaining("answered 404")]);
    expect(await judge({ repo: undefined })).toEqual([
      expect.stringContaining("which repository"),
    ]);
  });
});

describe("bun run gate pr: main's copy judges a pull request that sets a slice to done", () => {
  const sh = (dir: string, cmd: string[]) =>
    spawnSync(cmd[0] ?? "", cmd.slice(1), { cwd: dir, encoding: "utf8" });
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
  };
  /** A scratch repo holding the gate, with Slice 0 proof ready on main and set to done on branch feat; main's commit. */
  const project = () => {
    const dir = mkdtempSync(join(tmpdir(), "done-gate-proof-"));
    dirs.push(dir);
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
    mkdirSync(join(dir, "docs", "tracker"), { recursive: true });
    copyFileSync(
      join(import.meta.dir, "..", "docs", "tracker", "parse.js"),
      join(dir, "docs", "tracker", "parse.js"),
    );
    writeFileSync(join(dir, "STATE.md"), "# State\n");
    writeFileSync(join(dir, "ROADMAP.md"), MAIN);
    sh(dir, ["git", "init", "-q", "-b", "main"]);
    commit(dir);
    const main = sh(dir, ["git", "rev-parse", "HEAD"]).stdout.trim();
    sh(dir, ["git", "checkout", "-qb", "feat"]);
    writeFileSync(join(dir, "ROADMAP.md"), DONE);
    commit(dir);
    sh(dir, ["git", "checkout", "-q", "main"]);
    return { dir, main };
  };
  /** Judge feat from main with GitHub's API answered by `answer`; the gate runs as its own process. */
  const judged = async (
    dir: string,
    answer: (path: string) => unknown,
    body = BODY,
  ) => {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: (req) => {
        const path = new URL(req.url).pathname.slice(1);
        const out = answer(path);
        return out === undefined
          ? new Response('{"message":"Not Found"}', { status: 404 })
          : Response.json(out);
      },
    });
    try {
      const p = Bun.spawn(
        [
          "bun",
          "scripts/done-gate.ts",
          "pr",
          "--base",
          "main",
          "--head",
          "feat",
        ],
        {
          cwd: dir,
          env: {
            ...process.env,
            PR_BODY: body,
            PR_NUMBER: "7",
            GITHUB_API_URL: `http://127.0.0.1:${server.port}`,
            GITHUB_REPOSITORY: REPO,
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const out =
        (await new Response(p.stdout).text()) +
        (await new Response(p.stderr).text());
      return { status: await p.exited, out };
    } finally {
      server.stop(true);
    }
  };
  const answers =
    (sha: string, r: Run = {}, jobs = [passedJob()]) =>
    (path: string) =>
      path === `repos/${REPO}/actions/runs/${ID}`
        ? run({ head_sha: sha, ...r })
        : path === `repos/${REPO}/actions/runs/${ID}/jobs`
          ? { jobs }
          : undefined;

  it("lets it through when GitHub reports a passing proof run of Slice 0 on main's commit", async () => {
    const { dir, main } = project();
    const r = await judged(dir, answers(main));
    expect(r.out).toContain("Pull request ✓");
    expect(r.status).toBe(0);
  });

  it("refuses it when the linked run failed, left a step waiting, or GitHub does not know it", async () => {
    const { dir, main } = project();
    for (const [answer, why] of [
      [answers(main, { conclusion: "failure" }), "concluded failure"],
      [answers(main, {}, [passedJob(0, "skipped")]), "left a step waiting"],
      [() => undefined, "the repository is private"],
    ] as const) {
      const r = await judged(dir, answer);
      expect(r.out).toContain("Pull request ✗");
      expect(r.out).toContain(why);
      expect(r.status).toBe(1);
    }
  });
});
