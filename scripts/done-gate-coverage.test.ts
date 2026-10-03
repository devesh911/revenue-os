// Every product line a change adds is run by at least one test (ROADMAP.md, Slice 0). The gate's own test run
// (`bun run gate tests`) writes an lcov report, and each line the change adds to a .ts or .tsx file under apps,
// services or packages must be one it ran, read with the line rule in scripts/done-gate/lcov.ts. The shapes below
// are reproduced on real Bun coverage, so a Bun upgrade that changes what Bun reports shows up here: the first test
// fails until someone re-runs them on the new version, updates which the rule catches and STATE.md's known holes,
// and then WRITTEN_FOR.
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  setDefaultTimeout,
} from "bun:test";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { unrunLines } from "./done-gate/coverage";
import { markNotes } from "./done-gate/coverage-marks";
import type { Added } from "./done-gate/diff";
import { type Hits, lineRan, parseLcov } from "./done-gate/lcov";
import { untestedMigrations } from "./done-gate/migration-tests";
import { unquotedMarks } from "./done-gate/pr-coverage-marks";
import { checkRules } from "./done-gate/rules";

/** The Bun version these shapes were reproduced on. */
const WRITTEN_FOR = "1.3.11";

setDefaultTimeout(30_000); // the gate runs start bun and git several times
const dirs: string[] = [];
const scratch = (name: string) => {
  const dir = mkdtempSync(join(tmpdir(), `done-gate-coverage-${name}-`));
  dirs.push(dir);
  return dir;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const write = (dir: string, file: string, body: string) => {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), body);
};
const sh = (dir: string, cmd: string[], env: Record<string, string> = {}) =>
  spawnSync(cmd[0] as string, cmd.slice(1), {
    cwd: dir,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });

it(`the shapes below were reproduced on Bun ${WRITTEN_FOR}, the version the repo pins`, () => {
  const pinned = JSON.parse(
    readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"),
  ).engines.bun;
  if (pinned !== WRITTEN_FOR || Bun.version !== WRITTEN_FOR)
    throw new Error(
      `Bun is ${Bun.version} and the repo pins ${pinned}, but the coverage shapes in this file were reproduced on ${WRITTEN_FOR}. Re-run each shape on the new version, update which the rule catches here and the known holes in STATE.md, then set WRITTEN_FOR.`,
    );
});

// Each shape, with the paths a test takes. The line that never runs carries a comment naming it.
const SHAPES = `export const oneLine = () => 5; // ONE-LINE-FUNCTION

export function neverCalled(x: number) {
  const doubled = x * 2;
  return doubled; // NEVER-CALLED
}

export function sign(x: number) {
  if (x >= 0) {
    return "plus";
  } else {
    return "minus"; // NEVER-TAKEN-ELSE
  }
}

export const shapes = {
  used() {
    return 1;
  },
  unused() {
    return 2; // NEVER-CALLED-METHOD
  },
};

export function pick(x: string) {
  switch (x) {
    case "a":
      return 1;
    default:
      return 0; // UNUSED-DEFAULT
  }
}

export function firstArm(yes: boolean) {
  return yes
    ? "yes" // FIRST-ARM
    : "no";
}

export function lastArm(yes: boolean) {
  return yes
    ? "yes"
    : "no"; // LAST-ARM
}

export class Box {
  open() {
    return 1;
  }
  shut() {
    const a = 1;
    return a; // UNLISTED
  }
}

export function outer() {
  const inner = () => {
    const z = 3;
    return z;
  };
  return 2; // WRONGLY-REPORTED
}
`;
const SHAPES_TEST = `import { expect, test } from "bun:test";
import { firstArm, lastArm, outer, pick, shapes, sign } from "./shapes";
test("the paths a test takes", () => {
  expect(sign(1)).toBe("plus");
  expect(shapes.used()).toBe(1);
  expect(pick("a")).toBe(1);
  expect(firstArm(false)).toBe("no");
  expect(lastArm(true)).toBe("yes");
  expect(outer()).toBe(2);
});
`;
const lineOf = (tag: string) =>
  SHAPES.split("\n").findIndex((l) => l.endsWith(`// ${tag}`)) + 1;

describe(`what Bun ${WRITTEN_FOR} reports for each shape, and which the line rule catches`, () => {
  let hits: Hits = new Map();
  beforeAll(() => {
    const dir = scratch("shapes");
    write(dir, "shapes.ts", SHAPES);
    write(dir, "shapes.test.ts", SHAPES_TEST);
    const r = sh(dir, [
      process.execPath,
      "test",
      "--coverage",
      "--coverage-reporter=lcov",
      "--coverage-dir=report",
    ]);
    expect(r.status).toBe(0);
    hits = parseLcov(
      readFileSync(join(dir, "report", "lcov.info"), "utf8"),
      dir,
    );
  });
  const bunSays = (tag: string) => hits.get("shapes.ts")?.get(lineOf(tag));

  it("a never-called function: caught (Bun marks its last line run, but not the line before it)", () => {
    expect(bunSays("NEVER-CALLED")).toBeGreaterThan(0);
    expect(lineRan(hits, "shapes.ts", lineOf("NEVER-CALLED"))).toBe(false);
  });
  it("a never-taken else: caught", () => {
    expect(bunSays("NEVER-TAKEN-ELSE")).toBeGreaterThan(0);
    expect(lineRan(hits, "shapes.ts", lineOf("NEVER-TAKEN-ELSE"))).toBe(false);
  });
  it("a never-called object method: caught", () => {
    expect(bunSays("NEVER-CALLED-METHOD")).toBeGreaterThan(0);
    expect(lineRan(hits, "shapes.ts", lineOf("NEVER-CALLED-METHOD"))).toBe(
      false,
    );
  });
  it("an unused switch default: NOT caught (STATE.md known hole): Bun lists no line for `default:`, and the case before it ran", () => {
    expect(lineRan(hits, "shapes.ts", lineOf("UNUSED-DEFAULT"))).toBe(true);
  });
  it("a ternary arm on its own line, never taken: NOT caught (STATE.md known hole): Bun marks the arm run, the first arm or the last, and the line before it ran", () => {
    for (const arm of ["FIRST-ARM", "LAST-ARM"]) {
      expect(bunSays(arm)).toBeGreaterThan(0);
      expect(lineRan(hits, "shapes.ts", lineOf(arm))).toBe(true);
    }
  });
  it("a never-called function written on one line: NOT caught (STATE.md known hole): the line ran when the file loaded", () => {
    expect(lineRan(hits, "shapes.ts", lineOf("ONE-LINE-FUNCTION"))).toBe(true);
  });
  it("the last line of a never-called class method: NOT caught alone (STATE.md known hole): Bun lists no line there, so it reads as holding no code; the method's earlier lines are caught", () => {
    expect(bunSays("UNLISTED")).toBeUndefined();
    expect(lineRan(hits, "shapes.ts", lineOf("UNLISTED") - 1)).toBe(false);
  });
  it("a line the rule wrongly reports as not run (the one after a never-called inner function) is marked on its line like any other gap", () => {
    const line = lineOf("WRONGLY-REPORTED");
    expect(bunSays("WRONGLY-REPORTED")).toBeGreaterThan(0);
    expect(lineRan(hits, "shapes.ts", line)).toBe(false);
    const file = "packages/p/src/shapes.ts";
    const remapped = new Map([[file, hits.get("shapes.ts") ?? new Map()]]);
    const at = (text: string) => [{ file, line, text }];
    expect(
      unrunLines(at("  return 2;"), remapped, { read: () => SHAPES }),
    ).toEqual([`${file}: line ${line} never ran`]);
    expect(
      unrunLines(
        at(
          "  return 2; // coverage gap: Bun's rule reads the never-called inner function above as this line",
        ),
        remapped,
        { read: () => SHAPES },
      ),
    ).toEqual([]);
  });
});

describe("parseLcov and lineRan: Bun's report, read with the line rule", () => {
  const REPORT = [
    "TN:",
    "SF:packages/a/src/x.ts",
    "DA:1,3",
    "DA:2,0",
    "DA:4,1",
    "DA:6,2",
    "end_of_record",
    "SF:/repo/packages/b/src/y.ts",
    "DA:3,1",
    "end_of_record",
  ].join("\n");
  const hits = parseLcov(REPORT, "/repo");

  it("names each file from the repository's root, whether the report writes it relative or absolute", () => {
    expect([...hits.keys()]).toEqual([
      "packages/a/src/x.ts",
      "packages/b/src/y.ts",
    ]);
    expect(hits.get("packages/a/src/x.ts")?.get(2)).toBe(0);
  });
  it("a line runs only when Bun marks it run and also the nearest earlier line the report lists", () => {
    expect(lineRan(hits, "packages/a/src/x.ts", 1)).toBe(true); // nothing listed before it
    expect(lineRan(hits, "packages/a/src/x.ts", 2)).toBe(false); // Bun says 0
    expect(lineRan(hits, "packages/a/src/x.ts", 4)).toBe(false); // the line before it the report lists, 2, did not run
    expect(lineRan(hits, "packages/a/src/x.ts", 6)).toBe(true);
    expect(lineRan(hits, "packages/a/src/x.ts", 5)).toBe(false); // not listed
    expect(lineRan(hits, "packages/c/src/z.ts", 1)).toBe(false); // file not in the report
  });
});

describe("unrunLines: which added product lines no test ran", () => {
  const hits: Hits = new Map([
    [
      "packages/p/src/a.ts",
      new Map([
        [1, 4],
        [2, 0],
        [3, 1],
        [5, 2],
      ]),
    ],
  ]);
  const add = (file: string, ...lines: [number, string][]): Added[] =>
    lines.map(([line, text]) => ({ file, line, text }));
  const none = { read: () => "export const a = 1;\n" };

  it("reports each added line in scope that did not run, by file and line", () => {
    expect(
      unrunLines(
        add(
          "packages/p/src/a.ts",
          [1, "export function f() {"],
          [2, "  const x = 1;"],
          [3, "  return x;"],
          [4, "}"],
          [5, "f();"],
        ),
        hits,
        none,
      ),
    ).toEqual(["packages/p/src/a.ts: lines 2-3 never ran"]);
  });
  it("a file in scope missing from the report counts as 0% covered: every added line holding code", () => {
    expect(
      unrunLines(
        add(
          "services/w/src/b.tsx",
          [1, "// a comment"],
          [2, ""],
          [3, "export const b = () => <p>hi</p>;"],
          [4, "export const c = 2;"],
        ),
        hits,
        none,
      ),
    ).toEqual([
      "services/w/src/b.tsx: lines 3-4 never ran (no test loads this file, so all of it counts as not run)",
    ]);
  });
  it("a file of types alone holds no code to run, so it needs no test", () => {
    expect(
      unrunLines(
        add("packages/p/src/types.ts", [1, "export type T = { a: number };"]),
        hits,
        { read: () => "export type T = { a: number };\n" },
      ),
    ).toEqual([]);
  });
  it("judges every .ts and .tsx file under apps, services and packages, a tool's settings file too, but no test or declaration file", () => {
    const code: [number, string] = [1, "export const z = 1;"];
    expect(
      unrunLines(
        [
          ...add("scripts/x.ts", code),
          ...add("packages/p/test/x.test.ts", code),
          ...add("services/w/src/index.test.ts", code),
          ...add("apps/console/e2e/x.e2e.ts", code),
          ...add("packages/p/src/x.d.ts", code),
          ...add("packages/p/src/x.js", code),
          ...add("docs/x.ts", code),
          ...add("apps/console/vite.config.ts", code),
        ],
        hits,
        none,
      ),
    ).toEqual([
      "apps/console/vite.config.ts: line 1 never ran (no test loads this file, so all of it counts as not run)",
    ]);
  });
  it("moved lines, as the done-rules item detects them, are exempt", () => {
    const lines = add(
      "packages/p/src/a.ts",
      [2, "  const x = 1;"],
      [3, "  return x;"],
    );
    expect(
      unrunLines(lines, hits, {
        ...none,
        isMoved: (f, l) => f === "packages/p/src/a.ts" && l === 2,
      }),
    ).toEqual(["packages/p/src/a.ts: line 3 never ran"]);
  });
  it("a marked line is not a gap: a deliberate gap with its reason, or console code a named browser test drives", () => {
    expect(
      unrunLines(
        add(
          "packages/p/src/a.ts",
          [
            2,
            "  const x = 1; // coverage gap: runs only on a real network failure",
          ],
          [
            3,
            "  return x; /* coverage: browser-only (apps/console/e2e/smoke.e2e.ts) */",
          ],
        ),
        hits,
        { ...none, exists: (f) => f === "apps/console/e2e/smoke.e2e.ts" },
      ),
    ).toEqual([]);
  });
  it("a mark that does not hold is a problem, and its line still counts: no reason, or no such browser test", () => {
    expect(
      unrunLines(
        add(
          "packages/p/src/a.ts",
          [2, "  const x = 1; // coverage gap: ok"],
          [
            3,
            "  return x; // coverage: browser-only (apps/console/e2e/gone.e2e.ts)",
          ],
        ),
        hits,
        { ...none, exists: () => false },
      ),
    ).toEqual([
      "packages/p/src/a.ts:2 has a coverage mark without a reason: write `// coverage gap: <why>`",
      "packages/p/src/a.ts:3 is marked browser-only, but apps/console/e2e/gone.e2e.ts is not a browser test (a .e2e.ts file) in this checkout",
      "packages/p/src/a.ts: lines 2-3 never ran",
    ]);
  });
});

describe("every mark is shown to Devesh: in each stop message and CI's log (the done rules' notes) and in the PR body", () => {
  const marked: Added[] = [
    {
      file: "apps/console/src/pages/X.tsx",
      line: 12,
      text: "      {/* coverage: browser-only (apps/console/e2e/smoke.e2e.ts) */}",
    },
    {
      file: "services/worker/src/y.ts",
      line: 3,
      text: "  retry(); // coverage gap: runs only when the provider times out",
    },
    {
      file: "scripts/z.ts",
      line: 1,
      text: "// coverage gap: a script is not a product file, so this is no mark",
    },
  ];
  it("the done rules' notes list each mark on an added product line", () => {
    expect(markNotes(marked)).toEqual([
      "coverage mark at apps/console/src/pages/X.tsx:12: browser-only (apps/console/e2e/smoke.e2e.ts)",
      "coverage mark at services/worker/src/y.ts:3: coverage gap: runs only when the provider times out",
    ]);
    expect(checkRules([], marked, () => []).notes).toEqual(markNotes(marked));
  });
  it("the PR body must quote each mark: a `Coverage mark:` line naming its file and what it says", () => {
    expect(unquotedMarks(marked, "Roadmap: off-roadmap — x\n")).toEqual([
      "the PR body does not show the coverage mark at apps/console/src/pages/X.tsx:12: add the line `Coverage mark: apps/console/src/pages/X.tsx · browser-only (apps/console/e2e/smoke.e2e.ts)`",
      "the PR body does not show the coverage mark at services/worker/src/y.ts:3: add the line `Coverage mark: services/worker/src/y.ts · coverage gap: runs only when the provider times out`",
    ]);
    expect(
      unquotedMarks(
        marked,
        [
          "Roadmap: off-roadmap — x",
          "Coverage mark: apps/console/src/pages/X.tsx · browser-only (apps/console/e2e/smoke.e2e.ts)",
          "- Coverage mark: services/worker/src/y.ts · coverage gap: runs only when the provider times out",
        ].join("\n"),
      ),
    ).toEqual([]);
    // A quote GitHub doesn't show (an HTML comment) is no quote.
    expect(
      unquotedMarks(
        marked.slice(1),
        "<!-- Coverage mark: services/worker/src/y.ts · coverage gap: runs only when the provider times out -->",
      ),
    ).toHaveLength(1);
  });
});

describe("a new migration counts as covered only when the same change adds or edits a database test that uses what it adds", () => {
  const M = "supabase/migrations";
  const lines = (file: string, text: string): Added[] =>
    text.split("\n").map((t, i) => ({ file, line: i + 1, text: t }));
  const DENIAL = `import { withOrg } from "@revenue-os/db";
const rows = await withOrg(app, orgB, (tx) => tx.query("select id from notes where org_id = $1", [orgA]));
expect(rows).toHaveLength(0);`;
  const BEHAVIOUR = `import { Pool } from "pg";
const admin = new Pool({ connectionString: LOCAL_DB_URL });
const r = await admin.query("select app.due_org_ids()");
expect(r.rows).toHaveLength(1);`;
  const files: Record<string, string> = {
    "packages/db/test/notes.test.ts": DENIAL,
    "services/worker/test/due.test.ts": BEHAVIOUR,
    "packages/p/test/plain.test.ts": `expect("notes").toBe("notes");`,
  };
  const read = (f: string) => files[f] ?? "";

  it("a new table needs a cross-company denial test, in the same change, that names it", () => {
    const sql = lines(
      `${M}/018_notes.sql`,
      "-- notes\ncreate table if not exists public.notes (id uuid, org_id uuid not null);\nalter table notes enable row level security;",
    );
    expect(untestedMigrations(sql, read)).toEqual([
      `${M}/018_notes.sql creates the table notes, but no database test this change adds or edits names it in a cross-company denial test (another company's read or write refused)`,
    ]);
    expect(
      untestedMigrations(
        [...sql, ...lines("packages/db/test/notes.test.ts", DENIAL)],
        read,
      ),
    ).toEqual([]);
    // Named only in a test that never reaches the database, or in a database test that refuses nothing: not covered.
    expect(
      untestedMigrations(
        [
          ...sql,
          ...lines(
            "packages/p/test/plain.test.ts",
            files["packages/p/test/plain.test.ts"] ?? "",
          ),
          ...lines(
            "services/worker/test/due.test.ts",
            'await admin.query("select * from notes");',
          ),
        ],
        (f) => (f === "services/worker/test/due.test.ts" ? BEHAVIOUR : read(f)),
      ),
    ).toHaveLength(1);
  });
  it("anything else it adds (a function, a column, a view, a type, a change to a table) needs a database test that names it", () => {
    const fn = lines(
      `${M}/019_due.sql`,
      "create or replace function app.due_org_ids() returns setof uuid\nlanguage sql as $$ select 1 $$;\nalter table contacts add column if not exists nickname text;",
    );
    expect(untestedMigrations(fn, read)).toEqual([
      `${M}/019_due.sql adds or changes due_org_ids, nickname, but no database test this change adds or edits names them`,
    ]);
    expect(
      untestedMigrations(
        [
          ...fn,
          ...lines(
            "services/worker/test/due.test.ts",
            'const r = await admin.query("select app.due_org_ids(), nickname from contacts");',
          ),
        ],
        read,
      ),
    ).toEqual([]);
    const cascade = lines(
      `${M}/020_cascade.sql`,
      "alter table webhook_events drop constraint webhook_events_org_id_fkey;",
    );
    expect(untestedMigrations(cascade, read)).toEqual([
      `${M}/020_cascade.sql adds or changes webhook_events, but no database test this change adds or edits names them`,
    ]);
  });
  it("a change with no new migration asks for nothing", () => {
    expect(untestedMigrations(lines("packages/p/src/a.ts", "x"), read)).toEqual(
      [],
    );
  });
});

describe("bun run gate tests: the gate's own test run reads its coverage and refuses an added line no test runs", () => {
  const GATE = join(import.meta.dir, "done-gate.ts");
  /** A scratch repo whose main holds a copy of the gate, a product file and its test; origin/main is main. */
  const project = () => {
    const dir = scratch("gate");
    mkdirSync(join(dir, "scripts"));
    copyFileSync(GATE, join(dir, "scripts", "done-gate.ts"));
    cpSync(
      join(import.meta.dir, "done-gate"),
      join(dir, "scripts", "done-gate"),
      { recursive: true },
    );
    mkdirSync(join(dir, "docs", "tracker"), { recursive: true }); // the gate reads ROADMAP.md with the tracker's parser
    copyFileSync(
      join(import.meta.dir, "..", "docs", "tracker", "parse.js"),
      join(dir, "docs", "tracker", "parse.js"),
    );
    write(dir, "packages/p/src/a.ts", "export const one = () => 1;\n");
    write(
      dir,
      "packages/p/test/a.test.ts",
      'import { expect, it } from "bun:test";\nimport { one } from "../src/a";\nit("one", () => expect(one()).toBe(1));\n',
    );
    const GIT = ["git", "-c", "user.email=t@t", "-c", "user.name=t"];
    sh(dir, ["git", "init", "-q", "-b", "main"]);
    sh(dir, ["git", "add", "-A"]);
    sh(dir, [...GIT, "commit", "-qm", "x"]);
    sh(dir, ["git", "update-ref", "refs/remotes/origin/main", "HEAD"]);
    sh(dir, ["git", "checkout", "-qb", "feat"]);
    return dir;
  };
  const gateTests = (dir: string) => {
    const r = sh(dir, [process.execPath, "scripts/done-gate.ts", "tests"]);
    return { status: r.status, out: r.stdout + r.stderr };
  };

  it("fails naming a line a test never runs and a file no test loads, then passes once a test runs them", () => {
    const dir = project();
    write(
      dir,
      "packages/p/src/a.ts",
      "export const one = () => 1;\nexport function two() {\n  const n = 2;\n  return n;\n}\n",
    );
    write(dir, "packages/p/src/b.ts", "export const three = 3;\n");
    const failed = gateTests(dir);
    expect(failed.status).toBe(1);
    expect(failed.out).toContain(
      "✗ Some lines this change adds are run by no test:",
    );
    // Bun lists no line for the last `return` of a never-called function at the end of a file (STATE.md known hole).
    expect(failed.out).toContain("- packages/p/src/a.ts: lines 2-3 never ran");
    expect(failed.out).toContain(
      "- packages/p/src/b.ts: line 1 never ran (no test loads this file, so all of it counts as not run)",
    );
    write(
      dir,
      "packages/p/test/b.test.ts",
      'import { expect, it } from "bun:test";\nimport { two } from "../src/a";\nimport { three } from "../src/b";\nit("two, three", () => expect(two() + three).toBe(5));\n',
    );
    const passed = gateTests(dir);
    expect(passed.out).not.toContain("run by no test");
    expect(passed.status).toBe(0);
  });

  it("a marked line passes the tests, and bun run gate pr (main's copy, in CI) shows the mark and refuses a body that does not quote it", () => {
    const dir = project();
    const MARK = "coverage gap: it prints only when someone runs it by hand";
    write(
      dir,
      "packages/p/src/a.ts",
      `export const one = () => 1;\nif (process.env.BY_HAND) console.log("by hand"); // ${MARK}\n`,
    );
    expect(gateTests(dir).status).toBe(0);
    const judged = (body: string) => {
      const r = sh(
        dir,
        [process.execPath, "scripts/done-gate.ts", "pr", "--base", "main"],
        { PR_BODY: body },
      );
      return { status: r.status, out: r.stdout + r.stderr };
    };
    const FIRST = "Roadmap: off-roadmap — a marked line\n";
    const bare = judged(FIRST);
    expect(bare.out).toContain(
      `- the PR body does not show the coverage mark at packages/p/src/a.ts:2: add the line \`Coverage mark: packages/p/src/a.ts · ${MARK}\``,
    );
    expect(bare.status).toBe(1);
    const quoted = judged(
      `${FIRST}Coverage mark: packages/p/src/a.ts · ${MARK}\n`,
    );
    expect(quoted.out).toContain(
      `⚠ coverage mark at packages/p/src/a.ts:2: ${MARK}`,
    );
    expect(quoted.status).toBe(0);
  });
});
