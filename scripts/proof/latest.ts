// Each `proof ready` or `done` slice's latest proof run, read from GitHub with gh (`gh run list` and `gh run view`
// on the proof workflow), and what `bun run cycle --banner` tells the session to do about it. It judges a run as
// rules-from-main does (scripts/done-gate/proof-run.ts), so it never asks for a "Proof passed:" link that
// rules-from-main would refuse, and it gives up within BUDGET_MS, so the session-start hook (20 seconds, git fetch
// included) is never cut short.

import { spawnSync } from "node:child_process";
import type { Slice } from "../../docs/tracker/parse.js";
import {
  type Job,
  type Outcome,
  sliceOutcome,
  unlinkable,
} from "../done-gate/proof-run";

export type Latest = {
  n: number;
  outcome: Outcome | "running";
  url: string;
  id: string;
  date: string; // the day the run started, as GitHub dates it (UTC): the date "Proof passed:" takes
  unlinkable?: string; // why the run as a whole can't be a "Proof passed:" link, when it can't
};
type Listed = {
  databaseId: number;
  displayTitle?: string;
  status?: string;
  conclusion?: string;
  createdAt?: string;
  url?: string;
};

const LOOKS = 4; // runs looked into at most
export const BUDGET_MS = 8000; // every gh call together: with the 5-second fetch, well inside the hook's 20 seconds
const CALL_MS = 5000;

/** gh's JSON answer, or why there is none (also when `until` has passed). */
function gh(
  root: string,
  env: NodeJS.ProcessEnv,
  args: string[],
  until: number,
) {
  const said = `gh ${args.slice(0, 2).join(" ")}`;
  const left = Math.min(CALL_MS, until - Date.now());
  if (left <= 0) return `${said} not read in time`;
  const r = spawnSync("gh", args, {
    cwd: root,
    encoding: "utf8",
    timeout: left,
    env: { ...process.env, ...env, GH_PROMPT_DISABLED: "1" },
  });
  if (r.status !== 0)
    return `${said} ${r.error && /ETIMEDOUT/.test(String(r.error)) ? "not read in time" : `failed: ${(r.stderr || String(r.error ?? "no answer")).trim().split("\n")[0]}`}`;
  try {
    return JSON.parse(r.stdout) as unknown;
  } catch {
    return `${said} gave an answer that could not be read`;
  }
}

/**
 * The newest run of the proof workflow that proved each slice in `wanted` (none for a slice no recent run proved), or
 * why they could not be read, within `budgetMs` for every gh call together.
 */
export function readLatest(
  root: string,
  wanted: number[],
  env: NodeJS.ProcessEnv = {},
  budgetMs = BUDGET_MS,
): Latest[] | string {
  const until = Date.now() + budgetMs;
  const list = gh(
    root,
    env,
    [
      "run",
      "list",
      "--workflow",
      "proof.yml",
      "--limit",
      "20",
      "--json",
      "databaseId,displayTitle,status,conclusion,createdAt,url",
    ],
    until,
  );
  if (typeof list === "string") return list;
  const left = new Set(wanted);
  const found: Latest[] = [];
  let looked = 0;
  for (const run of list as Listed[]) {
    if (!left.size || looked === LOOKS) break;
    const only = run.displayTitle?.match(/^Proof of Slice (\d+)$/)?.[1]; // a run by hand proves just that slice
    if (only !== undefined && !left.has(Number(only))) continue;
    looked++;
    const view = gh(
      root,
      env,
      ["run", "view", String(run.databaseId), "--json", "jobs"],
      until,
    );
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
        unlinkable: unlinkable(run),
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
    if (s.Status === "done") return passed;
    if (r.unlinkable)
      return `${passed} But that run as a whole ${r.unlinkable}, and rules-from-main takes only a run that succeeded as a whole (every slice it proved, and the posting of its reports): ${r.unlinkable.startsWith("is still") ? "wait for it to finish" : "leave the slice as it is until a later run does"}.`;
    return `${passed} Set it to done: "Status: done" and "Proof passed: ${r.date} · [run ${r.id}](${r.url})", in a pull request whose first line is "Roadmap: Slice ${s.n} — replan: its proof passed" and whose body carries the run's report (its comment on the "Proof reports" issue; rules-from-main checks its heading and Run line).`;
  });
}
