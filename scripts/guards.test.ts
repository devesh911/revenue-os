// The guards `bun run guards` runs. Each case runs the real scripts/guards.sh inside a throwaway git repo — the
// other guards find nothing to scan there and pass. S4.1 (lessons 2026-09-25: the VPS address sat in tracked files
// and gitleaks, which hunts credentials, missed it): public test addresses are assembled at runtime so this file
// never trips the guard it tests. The pattern-files guard: a pattern names only files that exist, and an excerpt
// still matches the file it names; its fixtures name .sql and .md files, which it reads like any other.
import { afterAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const GUARDS = join(import.meta.dir, "guards.sh");
const PUBLIC_ADDRESS = join(import.meta.dir, "guards", "public-address.sh");
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function runGuards(
  files: Record<string, string>,
  { git = true, entry = GUARDS } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "guards-"));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), body);
  }
  if (git) {
    for (const args of [
      ["init", "-q"],
      ["add", "."],
    ])
      expect(spawnSync("git", args, { cwd: dir }).status).toBe(0);
  }
  const r = spawnSync("bash", [entry], { cwd: dir, encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}

const ip = (...octets: number[]) => octets.join(".");
const PUBLIC = ip(1, 1, 1, 1);
const JUST_PAST_172_16_12 = ip(172, 32, 0, 1); // public: 172.16/12 ends at 172.31

describe("guard S4.1 · public IPv4 literal in tracked files", () => {
  it("passes reserved ranges and address-shaped non-addresses", () => {
    const { code, out } = runGuards({
      "ok.md": [
        "docs: 192.0.2.10 198.51.100.7 203.0.113.99",
        "local: 127.0.0.1 0.0.0.0 10.1.2.3 172.16.0.1 172.31.255.255 192.168.1.1 169.254.169.254",
        // a version, a 5-part run, an octet over 255, an SVG path command
        "not addresses: v1.2.3.4 1.2.3.4.5 256.1.1.1 M12.5.3.4",
      ].join("\n"),
    });
    expect(out).toMatch(/guard S4\.1[^\n]*\n\s+PASS/);
    expect(code).toBe(0);
  });

  it("fails on a public address with file:line only — the address never prints", () => {
    const { code, out } = runGuards({
      "notes.md": [
        "intro",
        `the VPS is at ${PUBLIC}.`, // sentence-final full stop still counts
        `url: http://${PUBLIC}:8080/`,
        `${ip(10, 0, 0, 1)},${JUST_PAST_172_16_12}`, // private neighbour doesn't shield it
      ].join("\n"),
    });
    expect(code).toBe(1);
    for (const line of ["notes.md:2", "notes.md:3", "notes.md:4"])
      expect(out).toContain(line);
    expect(out).toContain("FAIL — S4.1");
    expect(out).not.toContain(PUBLIC);
    expect(out).not.toContain(JUST_PAST_172_16_12);
  });

  it("fails loudly when git grep cannot run — an unscanned tree never passes", () => {
    const { code, out } = runGuards({ "x.md": "x" }, { git: false });
    expect(code).toBe(1);
    expect(out).toContain("nothing was scanned");
  });

  it("excuses exactly one path (the SVG icon file) — a path allowlist hides future leaks", () => {
    const excused = [
      ...readFileSync(PUBLIC_ADDRESS, "utf8").matchAll(/':!([^']+)'/g),
    ].map((m) => m[1]);
    expect(excused).toEqual(["apps/www/src/visuals/IntentEvidence.tsx"]);
  });
});

describe("the entry, scripts/guards.sh", () => {
  it("fails when a guard it runs is missing — a guard never drops out in silence", () => {
    const copy = mkdtempSync(join(tmpdir(), "guards-entry-"));
    dirs.push(copy);
    cpSync(GUARDS, join(copy, "guards.sh"));
    cpSync(join(import.meta.dir, "guards"), join(copy, "guards"), {
      recursive: true,
    });
    rmSync(join(copy, "guards", "service-role.sh"));
    const { code, out } = runGuards(
      { "x.md": "x" },
      { entry: join(copy, "guards.sh") },
    );
    expect(code).toBe(1);
    expect(out).toContain("service-role.sh");
  });
});

const FENCE = "```";
const REAL = ["select 1;", "select id, name from t;", "select 3;"].join("\n");

describe("guard patterns · docs/patterns names only files that exist, and its excerpts match them", () => {
  it("passes real names and matching excerpts, and ignores what names no file in the repo", () => {
    const { code, out } = runGuards({
      "lib/real.sql": REAL,
      "docs/patterns/p.md": [
        "# Pattern: a fixture",
        "Read `lib/real.sql` and the folder `lib/`, or lib/real.sql:2 bare.",
        // not files in this repo: a command, a package, a web address, a word pair
        "Run `bun run guards`; import `@revenue-os/db`; see https://example.com/docs/gone.md; and/or.",
        `${FENCE}sql`,
        "-- lib/real.sql",
        "select 1;",
        "-- …",
        "select 3;",
        FENCE,
        `${FENCE}sql`,
        "# lib/real.sql",
        "select id, … from t;",
        FENCE,
        `${FENCE}ts`,
        'import { gone } from "../gone/away.sql"; // a stale/duplicate note names no file',
        'const page = "https://example.com/docs/gone.md";',
        FENCE,
      ].join("\n"),
    });
    expect(out).toMatch(/guard patterns[^\n]*\n\s+PASS/);
    expect(code).toBe(0);
  });

  it("fails on a name that doesn't exist, saying which pattern file and which name", () => {
    const { code, out } = runGuards({
      "lib/real.sql": REAL,
      "docs/patterns/p.md": [
        "Read `lib/gone.sql:12` and `gone/`, then lib/bare-gone.sql:3-4.",
        `${FENCE}ts`,
        "// lib/invented/schema.sql",
        "export const x = 1;",
        FENCE,
        `${FENCE}ts`,
        "const y = 2; // lives in lib/invented/other.sql — invented",
        FENCE,
      ].join("\n"),
      "docs/patterns/fine.md": "Read `lib/real.sql`.",
    });
    expect(code).toBe(1);
    for (const name of [
      "lib/gone.sql",
      "gone/",
      "lib/bare-gone.sql",
      "lib/invented/schema.sql",
      "lib/invented/other.sql",
    ])
      expect(out).toContain(`docs/patterns/p.md names ${name}, which`);
    expect(out).not.toContain("docs/patterns/fine.md");
    expect(out).toContain("FAIL — patterns");
  });

  it("fails when an excerpt's lines are no longer in its file, in order", () => {
    const excerpt = (...lines: string[]) =>
      [`${FENCE}sql`, "-- lib/real.sql", ...lines, FENCE].join("\n");
    const { code, out } = runGuards({
      "lib/real.sql": REAL,
      "docs/patterns/changed.md": excerpt("select 1;", "select 9;"),
      "docs/patterns/reordered.md": excerpt("select 3;", "select 1;"),
      "docs/patterns/reindented.md": excerpt("  select 1;"),
    });
    expect(code).toBe(1);
    expect(out).toContain(
      "docs/patterns/changed.md: the excerpt of lib/real.sql has a line that file doesn't, in this order: select 9;",
    );
    expect(out).toContain(
      "docs/patterns/reordered.md: the excerpt of lib/real.sql has a line that file doesn't, in this order: select 1;",
    );
    expect(out).toContain("docs/patterns/reindented.md: the excerpt");
  });

  it("skips a checkout with no docs/patterns folder", () => {
    const { code, out } = runGuards({ "x.md": "x" });
    expect(out).toContain("guard patterns · skipped (no docs/patterns)");
    expect(code).toBe(0);
  });
});
