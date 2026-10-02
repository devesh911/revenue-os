// The guards `bun run guards` runs. Each case runs the real scripts/guards.sh inside a throwaway git repo — the
// other guards find nothing to scan there and pass. S4.1 (lessons 2026-09-25: the VPS address sat in tracked files
// and gitleaks, which hunts credentials, missed it): public test addresses are assembled at runtime so this file
// never trips the guard it tests. The pattern-files guard: every code block in a pattern is an excerpt that still
// matches the file it names, and a pattern names only files the repository holds; its fixtures name .sql and .md
// files, which it reads like any other.
import { afterAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
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

/**
 * Runs the guards in a throwaway git repo (the folder `repo` inside a scratch folder) holding `files`, plus one
 * pattern file unless `patterns` is false; `outside` files sit in the scratch folder beside the repo, and `links`
 * are symbolic links (path → where it points), committed like files.
 */
function runGuards(
  files: Record<string, string>,
  {
    git = true,
    entry = GUARDS,
    patterns = true,
    outside = {} as Record<string, string>,
    links = {} as Record<string, string>,
  } = {},
) {
  const top = mkdtempSync(join(tmpdir(), "guards-"));
  dirs.push(top);
  const dir = join(top, "repo");
  const write = (path: string, body: string) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  };
  for (const [name, body] of Object.entries(outside))
    write(join(top, name), body);
  const all = patterns
    ? { "docs/patterns/none.md": "# Pattern: none yet\n", ...files }
    : files;
  for (const [name, body] of Object.entries(all)) write(join(dir, name), body);
  for (const [name, target] of Object.entries(links)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    symlinkSync(target, join(dir, name));
  }
  mkdirSync(dir, { recursive: true });
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
  it("runs every guard: each one's first line is in the output, so dropping one from its list fails", () => {
    const { code, out } = runGuards({ "x.md": "x" });
    for (const guard of [
      "guard S1.2 ·",
      "guard S4.1 ·",
      "guard S7.3 ·",
      "guard patterns ·",
    ])
      expect(out).toContain(guard);
    expect(code).toBe(0);
  });

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
const excerpt = (label: string, ...lines: string[]) =>
  [`${FENCE}sql`, label, ...lines, FENCE].join("\n");
const NOT_AN_EXCERPT = "a code block that is not an excerpt";

describe("guard patterns · every example is an excerpt of a file the repository holds, and every name is one", () => {
  it("passes real names and matching excerpts, and ignores what names no file in the repo", () => {
    const { code, out } = runGuards({
      "lib/real.sql": REAL,
      // real code whose own comment names a path from its package's folder, and a web address
      "lib/code.ts": [
        'import { gone } from "../gone/away.sql"; // see src/index.ts, a stale/duplicate note',
        "",
        'const page = "https://example.com/docs/gone.md";',
      ].join("\n"),
      "docs/patterns/p.md": [
        "# Pattern: a fixture",
        "Read `lib/real.sql` and the folders `lib/` and `lib`, or lib/real.sql:2 bare.",
        // not files in this repo: a command, a package, a web address, a word pair, a branch, a media type, an
        // import path, a pair of roles
        "Run `bun run guards`; import `@revenue-os/db`; see https://example.com/docs/gone.md; and/or.",
        "Branch off `origin/main`, answer `application/json`, import `hono/cors`, as `admin/operator`.",
        // a link is read from the pattern file's own folder
        "See [the query](../../lib/real.sql) and [its line](../../lib/real.sql#L2).",
        excerpt("-- lib/real.sql", "select 1;", "-- …", "select 3;"),
        excerpt("# lib/real.sql", "select id, … from t;"),
        [
          `${FENCE}ts`,
          "// lib/code.ts",
          'import { gone } from "../gone/away.sql"; // see src/index.ts, a stale/duplicate note',
          "",
          'const page = "https://example.com/docs/gone.md";',
          FENCE,
        ].join("\n"),
        ["~~~sql", "-- lib/real.sql", "select 3;", "~~~"].join("\n"),
      ].join("\n"),
      "docs/patterns/nested/q.md": "Read `lib/real.sql`.",
    });
    expect(out).toMatch(/guard patterns[^\n]*\n\s+PASS/);
    expect(code).toBe(0);
  });

  it("fails on a name the repository doesn't hold, saying which pattern file and which name", () => {
    const { code, out } = runGuards(
      {
        "lib/real.sql": REAL,
        ".gitignore": "dist/\n",
        "dist/app.js": "built, never committed",
        "docs/patterns/p.md": [
          "Read `lib/gone.sql:12` and `gone/`, then lib/bare-gone.sql:3-4.",
          "Not `../outside.txt`, nor `Lib/Real.sql`, nor `dist/app.js`, nor [this](../../lib/gone2.sql).",
          excerpt("// lib/invented/schema.sql", "export const x = 1;"),
        ].join("\n"),
        "docs/patterns/fine.md": "Read `lib/real.sql`.",
        "docs/patterns/console/d.md": "Read `lib/gone10.sql`.",
      },
      { outside: { "outside.txt": "outside the repo" } },
    );
    expect(code).toBe(1);
    for (const name of [
      "lib/gone.sql",
      "gone/",
      "lib/bare-gone.sql",
      "../outside.txt", // outside the repository
      "Lib/Real.sql", // another letter case, which a Mac's disk accepts
      "dist/app.js", // on disk, ignored by git
      "lib/gone2.sql", // a link's target, from the pattern's folder
      "lib/invented/schema.sql",
    ])
      expect(out).toContain(`docs/patterns/p.md names ${name}, which`);
    expect(out).toContain("docs/patterns/console/d.md names lib/gone10.sql");
    expect(out).not.toContain("docs/patterns/fine.md");
    expect(out).toContain("FAIL — patterns");
  });

  it("fails a code block that is not an excerpt: no label, a label with more than the path, a ~~~ block, an indented block", () => {
    const { code, out } = runGuards({
      "lib/real.sql": REAL,
      "docs/patterns/plain.md": [
        "An invented route:",
        `${FENCE}ts`,
        'app.post("/orgs/:orgId/notes", async (c) => {',
        '  const orgId = c.req.param("orgId");',
        "  return c.json(await db.insertNote(orgId, await c.req.json()));",
        "});",
        FENCE,
      ].join("\n"),
      "docs/patterns/lines.md": excerpt(
        "-- lib/real.sql:1-3",
        "select insert_note(); -- invented",
      ),
      "docs/patterns/from.md": excerpt(
        "-- From lib/real.sql",
        "select insert_note();",
      ),
      "docs/patterns/tilde.md": [
        "~~~sql",
        "-- lib/real.sql",
        "select insert_note(); -- invented",
        "~~~",
        "~~~ts",
        "db.insertNote(orgId);",
        "~~~",
      ].join("\n"),
      "docs/patterns/indented.md": [
        "An invented call:",
        "",
        "    await db.insertNote(orgId);",
      ].join("\n"),
    });
    expect(code).toBe(1);
    for (const p of ["plain.md:2", "lines.md:1", "from.md:1", "tilde.md:5"])
      expect(out).toContain(`docs/patterns/${p}: ${NOT_AN_EXCERPT}`);
    expect(out).toContain(
      "docs/patterns/tilde.md: the excerpt of lib/real.sql no longer matches it from this line: select insert_note(); -- invented",
    );
    expect(out).toContain(
      "docs/patterns/indented.md:3: an indented code block",
    );
  });

  it("fails when an excerpt's lines are no longer in its file, together and in order", () => {
    const { code, out } = runGuards({
      "lib/real.sql": REAL,
      // the agents query lost its company filter; the workflows query below still has one
      "lib/q.sql": [
        "select id",
        "  from agents",
        "  order by key;",
        "select id",
        "  from workflows",
        "  where org_id = $1;",
      ].join("\n"),
      "docs/patterns/changed.md": excerpt(
        "-- lib/real.sql",
        "select 1;",
        "select 9;",
      ),
      "docs/patterns/reordered.md": excerpt(
        "-- lib/real.sql",
        "select 3;",
        "select 1;",
      ),
      "docs/patterns/reindented.md": excerpt("-- lib/real.sql", "  select 1;"),
      // a line left out with no "…" line in its place
      "docs/patterns/skipped.md": excerpt(
        "-- lib/real.sql",
        "select 1;",
        "select 3;",
      ),
      "docs/patterns/filter.md": excerpt(
        "-- lib/q.sql",
        "select id",
        "  from agents",
        "  where org_id = $1;",
      ),
      "docs/patterns/blank.md": excerpt(
        "-- lib/real.sql",
        "select 1;",
        "",
        "select id, name from t;",
      ),
    });
    expect(code).toBe(1);
    const drift = (p: string, line: string) =>
      `docs/patterns/${p}: the excerpt of ${p === "filter.md" ? "lib/q.sql" : "lib/real.sql"} no longer matches it from this line: ${line}`;
    expect(out).toContain(drift("changed.md", "select 9;"));
    expect(out).toContain(drift("reordered.md", "select 1;"));
    expect(out).toContain(drift("reindented.md", "select 1;"));
    expect(out).toContain(drift("skipped.md", "select 3;"));
    expect(out).toContain(drift("filter.md", "where org_id = $1;"));
    expect(out).toContain(drift("blank.md", "(a blank line)"));
  });

  it("never reads a file outside the repository or through a link: a probe can't learn its lines", () => {
    const secret = { "outside.txt": "TOKEN=abc-q7\n" };
    const probes = (label: string) => ({
      "docs/patterns/probe-a.md": excerpt(label, "TOKEN=abc-a…"),
      "docs/patterns/probe-q.md": excerpt(label, "TOKEN=abc-q…"),
    });
    const outside = runGuards(probes("# ../outside.txt"), { outside: secret });
    const linked = runGuards(probes("# lib/link.txt"), {
      outside: secret,
      links: { "lib/link.txt": "../../outside.txt" },
    });
    for (const { code, out } of [outside, linked]) {
      expect(code).toBe(1);
      expect(out).not.toContain("no longer matches");
    }
    for (const p of ["probe-a", "probe-q"]) {
      expect(outside.out).toContain(
        `docs/patterns/${p}.md names ../outside.txt, which`,
      );
      expect(linked.out).toContain(
        `docs/patterns/${p}.md: the excerpt of lib/link.txt is a link`,
      );
    }
  });

  it("fails a checkout with no pattern files: a moved folder can't switch the guard off", () => {
    const { code, out } = runGuards(
      { "docs/examples/p.md": "Read `lib/gone.sql`." },
      { patterns: false },
    );
    expect(out).toContain("no pattern files under docs/patterns/");
    expect(code).toBe(1);
  });
});
