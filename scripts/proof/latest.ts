// Each `proof ready` or `done` slice's latest proof run, read from GitHub with gh (`gh run list` and `gh run view`
// on the proof workflow), and what `bun run cycle --banner` tells the session to do about it.

import { spawnSync } from "node:child_process";
import type { Slice } from "../../docs/tracker/parse.js";
import { type Job, type Outcome, sliceOutcome } from "../done-gate/proof-run";

export type Latest = {
  n: number;
  outcome: Outcome | "running";
  url: string;
  id: string;
  date: string; // the day the run started, as GitHub dates it (UTC): the date "Proof passed:" takes
};
type Listed = {
  databaseId: number;
  displayTitle?: string;
  createdAt?: string;
  url?: string;
};

const LOOKS = 4; // runs looked into at most, so a session's start waits seconds, not minutes

/** gh's JSON answer, or why there is none. */
function gh(root: string, env: NodeJS.ProcessEnv, args: string[]) {
  const said = `gh ${args.slice(0, 2).join(" ")}`;
  const r = spawnSync("gh", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 5000,
    env: { ...process.env, ...env, GH_PROMPT_DISABLED: "1" },
  });
  if (r.status !== 0)
    return `${said} failed: ${(r.stderr || String(r.error ?? "no answer")).trim().split("\n")[0]}`;
  try {
    return JSON.parse(r.stdout) as unknown;
  } catch {
    return `${said} gave an answer that could not be read`;
  }
}

/** The newest run of the proof workflow that proved each slice in `wanted` (none for a slice no recent run proved), or why they could not be read. */
export function readLatest(
  root: string,
  wanted: number[],
  env: NodeJS.ProcessEnv = {},
): Latest[] | string {
  const list = gh(root, env, [
    "run",
    "list",
    "--workflow",
    "proof.yml",
    "--limit",
    "20",
    "--json",
    "databaseId,displayTitle,status,createdAt,url",
  ]);
  if (typeof list === "string") return list;
  const left = new Set(wanted);
  const found: Latest[] = [];
  let looked = 0;
  for (const run of list as Listed[]) {
    if (!left.size || looked === LOOKS) break;
    const only = run.displayTitle?.match(/^Proof of Slice (\d+)$/)?.[1]; // a run by hand proves just that slice
    if (only !== undefined && !left.has(Number(only))) continue;
    looked++;
    const view = gh(root, env, [
      "run",
      "view",
      String(run.databaseId),
      "--json",
      "jobs",
    ]);
    if (typeof view === "string") return view;
    for (const n of [...left]) {
      const outcome = sliceOutcome((view as { jobs?: Job[] }).jobs ?? [], n);
      if (!outcome) continue;
      left.delete(n);
      found.push({
        n,
        outcome,
        url: run.url ?? "",
        id: String(run.databaseId),
        date: (run.createdAt ?? "").slice(0, 10),
      });
    }
  }
  return found.sort((a, b) => a.n - b.n);
}

/** PURE: what the banner says about each proof-ready or done slice's latest proof run; nothing when there is none. */
export function proofLines(
  slices: Slice[],
  latest: Latest[] | string | undefined,
): string[] {
  const due = slices.filter(
    (s) => s.Status === "proof ready" || s.Status === "done",
  );
  if (!due.length || latest === undefined) return [];
  if (typeof latest === "string")
    return [
      `Proof runs: could not read them (${latest}). Look at the proof workflow's runs on GitHub (Actions → proof) before changing a slice's status.`,
    ];
  return due.map((s) => {
    const r = latest.find((l) => l.n === s.n);
    const it = `Slice ${s.n} (${s.Status})`;
    if (!r)
      return `${it}: no proof run yet; the proof workflow (.github/workflows/proof.yml) runs it after each deploy to main and once a day.`;
    if (r.outcome === "running")
      return `${it}: its latest proof run is still going: ${r.url}.`;
    if (r.outcome === "failed")
      return `${it}: its latest proof run FAILED on ${r.date}: ${r.url}. Its report (the run's comment on the "Proof reports" issue) names the failed step: add an item to Slice ${s.n} naming the failure and set the slice to in progress.`;
    if (r.outcome === "waiting")
      return `${it}: its latest proof run (${r.date}, ${r.url}) has steps waiting on something in STATE.md → Waiting on Devesh, which its report names: leave the slice and its items as they are.`;
    const passed = `${it}: its latest proof run passed on ${r.date}: ${r.url}.`;
    return s.Status === "done"
      ? passed
      : `${passed} Set it to done: "Status: done" and "Proof passed: ${r.date} · [run ${r.id}](${r.url})", in a pull request whose first line is "Roadmap: Slice ${s.n} — replan: its proof passed" and whose body carries the run's report (its comment on the "Proof reports" issue).`;
  });
}
