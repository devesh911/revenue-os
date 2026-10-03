// `bun run cycle --banner` shows each `proof ready` or `done` slice's latest proof run (its result and link, read
// with `gh run list` and `gh run view` on the proof workflow, or that it could not read them) and tells the session
// what to do about it. The slice field the passing run's date and link go in is `Proof passed:`.
import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseRoadmap } from "../docs/tracker/parse.js";
import { banner, type Cycle } from "./cycle";
import { readLatest } from "./proof/latest";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const URL0 = "https://github.com/devesh911/revenue-os/actions/runs/555";
const slice = (n: number, status: string, passed = "—") =>
  `## Slice ${n}: Title ${n}\nStatus: ${status}\nGoal: g\nProof: p\nBlocked by: nothing\nProof passed: ${passed}\n\n- [x] A (agent) · evidence: [#1](https://example.com)\n`;
const STATE =
  "PHASE: SETUP\n\n## What works today\n| Area | Capability | Status | Where / why |\n|---|---|---|---|\n| Data | x | Works | y |\n## Waiting on Devesh\n## Decisions in force\n";
const cycle = (roadmap: string, proofRuns: Cycle["proofRuns"]): Cycle => ({
  roadmap: `# Roadmap\n\n${roadmap}`,
  state: STATE,
  branch: "feat/x",
  item: "A",
  from: "origin/main",
  proofRuns,
});

describe("the field a passing proof run is written in", () => {
  it("is `Proof passed:`; a done slice needs its date there, and the old name is reported as renamed", () => {
    const ok = parseRoadmap(
      `# Roadmap\n\n${slice(0, "done", `2026-10-05 · [run 555](${URL0})`)}`,
    );
    expect(ok.problems).toEqual([]);
    expect(ok.slices[0]?.["Proof passed"]).toBe(
      `2026-10-05 · [run 555](${URL0})`,
    );
    expect(parseRoadmap(`# Roadmap\n\n${slice(0, "done")}`).problems).toEqual([
      'Slice 0 says done but "Proof passed" has no date',
    ]);
    expect(
      parseRoadmap(
        `# Roadmap\n\n${slice(0, "in progress").replace("Proof passed:", "Seen by Devesh:")}`,
      ).problems,
    ).toEqual([
      'Slice 0: the field "Seen by Devesh:" is now "Proof passed:"',
      'Slice 0 is missing its "Proof passed:" line',
    ]);
  });

  it("is what the banner names", () => {
    const b = banner(cycle(slice(0, "in progress"), undefined));
    expect(b).toContain('"Proof passed:"');
    expect(b).not.toContain("Seen by Devesh");
  });
});

describe("the banner's proof lines", () => {
  const latest = (outcome: string, n = 0) => [
    { n, outcome, url: URL0, id: "555", date: "2026-10-05" },
  ];

  it("tells the session to set a passing proof-ready slice to done, with the run's date and link and its report", () => {
    const b = banner(
      cycle(slice(0, "proof ready"), latest("passed") as Cycle["proofRuns"]),
    );
    expect(b).toContain(
      `Slice 0 (proof ready): its latest proof run passed on 2026-10-05: ${URL0}.`,
    );
    expect(b).toContain(`"Proof passed: 2026-10-05 · [run 555](${URL0})"`);
    expect(b).toContain("Proof reports");
  });

  it("tells it to add an item naming a failure and set the slice to in progress, even a done one", () => {
    const b = banner(
      cycle(
        slice(0, "done", `2026-10-01 · [run 1](${URL0})`),
        latest("failed") as Cycle["proofRuns"],
      ),
    );
    expect(b).toContain(
      `Slice 0 (done): its latest proof run FAILED on 2026-10-05: ${URL0}.`,
    );
    expect(b).toContain("add an item to Slice 0 naming the failure");
    expect(b).toContain("set the slice to in progress");
  });

  it("leaves a waiting slice as it is, says a run is still going, and says when a slice has no run yet", () => {
    expect(
      banner(
        cycle(slice(0, "proof ready"), latest("waiting") as Cycle["proofRuns"]),
      ),
    ).toContain("leave the slice and its items as they are");
    expect(
      banner(
        cycle(slice(0, "proof ready"), latest("running") as Cycle["proofRuns"]),
      ),
    ).toContain("still going");
    expect(banner(cycle(slice(0, "proof ready"), []))).toContain(
      "Slice 0 (proof ready): no proof run yet",
    );
  });

  it("says it could not read the runs, and says nothing about runs when no slice is proof ready or done", () => {
    expect(
      banner(
        cycle(slice(0, "proof ready"), "gh run list failed: not logged in"),
      ),
    ).toContain("could not read them (gh run list failed: not logged in)");
    const none = banner(cycle(slice(0, "in progress"), []));
    expect(none).not.toContain("latest proof run");
    expect(none).not.toContain("no proof run yet");
  });
});

describe("reading the latest proof runs with gh", () => {
  /** A stand-in gh: `run list` answers `list`, `run view <id>` answers views[id]. */
  const gh = (list: unknown, views: Record<string, unknown>, fail = false) => {
    const bin = mkdtempSync(join(tmpdir(), "cycle-gh-"));
    dirs.push(bin);
    writeFileSync(join(bin, "list.json"), JSON.stringify(list));
    for (const [id, v] of Object.entries(views))
      writeFileSync(join(bin, `${id}.json`), JSON.stringify(v));
    writeFileSync(
      join(bin, "gh"),
      fail
        ? "#!/bin/sh\necho 'not logged in' >&2\nexit 1\n"
        : `#!/bin/sh\nif [ "$2" = list ]; then cat "${bin}/list.json"; else cat "${bin}/$3.json"; fi\n`,
      { mode: 0o755 },
    );
    return { PATH: `${bin}:${process.env.PATH}` };
  };
  const job = (n: number, conclusion: string, allPassed = "success") => ({
    name: `proof (${n})`,
    status: "completed",
    conclusion,
    steps: [{ name: "Every step passed", conclusion: allPassed }],
  });
  const list = [
    {
      databaseId: 3,
      displayTitle: "Proof of Slice 4",
      status: "completed",
      createdAt: "2026-10-06T03:00:00Z",
      url: "u3",
    },
    {
      databaseId: 2,
      displayTitle: "Proof of every proof-ready or done slice (schedule)",
      status: "completed",
      createdAt: "2026-10-05T03:00:00Z",
      url: "u2",
    },
    {
      databaseId: 1,
      displayTitle: "Proof of every proof-ready or done slice (schedule)",
      status: "completed",
      createdAt: "2026-10-04T03:00:00Z",
      url: "u1",
    },
  ];

  it("finds each slice's newest run that proved it, newest first, skipping a run by hand of another slice", () => {
    const env = gh(list, {
      2: { jobs: [job(0, "failure")] },
      1: { jobs: [job(0, "success"), job(1, "success", "skipped")] },
    });
    expect(readLatest(process.cwd(), [0, 1], env)).toEqual([
      { n: 0, outcome: "failed", url: "u2", id: "2", date: "2026-10-05" },
      { n: 1, outcome: "waiting", url: "u1", id: "1", date: "2026-10-04" },
    ]);
  });

  it("says why when gh can't read them", () => {
    expect(readLatest(process.cwd(), [0], gh([], {}, true))).toContain(
      "not logged in",
    );
  });
});
