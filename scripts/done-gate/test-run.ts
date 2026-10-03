// Running one test file alone with bun: each test's outcome from bun's JUnit report, what bun printed (which holds
// the error when the file can't load), and, when asked, which lines ran.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Hits, parseLcov } from "./lcov";

const RUN_MS = 10 * 60_000; // for one file; after that it is stopped and counts as not finished

export type Case = {
  file: string;
  line: number;
  name: string;
  outcome: "passed" | "failed" | "skipped";
};
export type FileRun = {
  cases: Case[];
  out: string;
  finished: boolean;
  hits: Hits;
};

/** A file bun runs as tests: name.test.ts, name_test.ts, name.spec.ts or name_spec.ts, in any JS or TS flavour. */
export const isTestFile = (f: string) =>
  /[._](test|spec)\.[cm]?[jt]sx?$/.test(f);

const ENTITY: Record<string, string> = {
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  amp: "&",
};

/** PURE: bun's JUnit report → each test it lists: its file, the line its call starts on, its name and outcome. */
export function casesOf(report: string): Case[] {
  return [
    ...report.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g),
  ].map(([, attrs = "", body = ""]) => {
    const attr = (k: string) =>
      (attrs.match(new RegExp(`\\b${k}="([^"]*)"`))?.[1] ?? "").replace(
        /&(quot|apos|lt|gt|amp);/g,
        (m, e: string) => ENTITY[e] ?? m,
      );
    return {
      file: attr("file"),
      line: Number(attr("line")),
      name: attr("name"),
      outcome: /<(failure|error)\b/.test(body)
        ? "failed"
        : body.includes("<skipped")
          ? "skipped"
          : "passed",
    };
  });
}

/** Runs `file`, named from `dir`, alone in `dir` as CI does (CI=1); with `coverage`, records which lines ran. */
export function runTestFile(
  dir: string,
  file: string,
  coverage = false,
): FileRun {
  const out = mkdtempSync(join(tmpdir(), "done-gate-run-"));
  const junit = join(out, "junit.xml");
  const read = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : "");
  try {
    const r = spawnSync(
      process.execPath,
      [
        "test",
        "--reporter=junit",
        `--reporter-outfile=${junit}`,
        ...(coverage
          ? ["--coverage", "--coverage-reporter=lcov", `--coverage-dir=${out}`]
          : []),
        `./${file}`,
      ],
      {
        cwd: dir,
        env: { ...process.env, CI: "1" },
        encoding: "utf8",
        maxBuffer: 256 << 20,
        timeout: RUN_MS,
      },
    );
    return {
      cases: casesOf(read(junit)).filter((c) => c.file === file),
      out: Bun.stripANSI(`${r.stdout ?? ""}${r.stderr ?? ""}`),
      finished: !r.error && r.signal === null,
      hits: parseLcov(read(join(out, "lcov.info")), dir),
    };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}
