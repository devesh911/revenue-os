// A change's tests are proven to test it (scripts/done-gate/tests-proven.ts): each test a change adds or edits must
// fail on main's code and pass on the change. The pure parts (coverage reports, where a test ends, why a file can't
// load, the "behaviour already on main" mark) are checked on text; the whole run on throwaway git repos holding a
// tiny product, with real git and real bun test runs on both sides.
import { afterAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  markBodyProblems,
  markNotes,
  markOn,
} from "./done-gate/already-on-main";
import { lineRan, parseLcov } from "./done-gate/lcov";
import { snapshot } from "./done-gate/snapshot";
import { casesOf } from "./done-gate/test-run";
import { testEnd } from "./done-gate/test-span";
import { missingOnMain, testsProven } from "./done-gate/tests-proven";

// Each repo test starts git and bun several times; with other agents busy on the machine that passes bun's 5 s.
setDefaultTimeout(60_000);
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

// The mark, built from pieces so this file's own lines never carry one.
const MARK = ["// behaviour already", "on main:"].join(" ");

describe("lcov: which lines a test run ran", () => {
  const report = [
    "TN:",
    "SF:apps/x/src/a.ts",
    "DA:1,25",
    "DA:3,0",
    "DA:4,0",
    "DA:5,1",
    "DA:8,2",
    "DA:9,2",
    "end_of_record",
    "SF:/repo/packages/p/src/b.ts",
    "DA:2,1",
    "end_of_record",
  ].join("\n");
  const hits = parseLcov(report, "/repo");

  it("reads each file's line counts, naming files from the root", () => {
    expect([...hits.keys()]).toEqual([
      "apps/x/src/a.ts",
      "packages/p/src/b.ts",
    ]);
    expect(hits.get("apps/x/src/a.ts")?.get(8)).toBe(2);
  });

  it("counts a line as run only when Bun marks it run and the nearest earlier line it lists ran too", () => {
    expect(lineRan(hits, "apps/x/src/a.ts", 1)).toBe(true); // nothing earlier listed
    expect(lineRan(hits, "apps/x/src/a.ts", 9)).toBe(true);
    // Bun 1.3.11 marks a never-called function's last line as run; the line before it says otherwise.
    expect(lineRan(hits, "apps/x/src/a.ts", 5)).toBe(false);
    expect(lineRan(hits, "apps/x/src/a.ts", 3)).toBe(false);
    expect(lineRan(hits, "apps/x/src/a.ts", 2)).toBe(false); // not listed: not code that runs
    expect(lineRan(hits, "apps/x/src/other.ts", 1)).toBe(false); // not in the report: 0% covered
  });
});

describe("testEnd: the last line of the test that starts on a line", () => {
  const source = [
    'import { expect, it } from "bun:test";', // 1
    'it("block", () => {', // 2
    "  expect(1).toBe(1);", // 3
    "});", // 4
    'it("one line", () => expect(f()).toBe(2));', // 5
    'it("wrapped", () =>', // 6
    "  expect(g()).toBe(3));", // 7
    'it("brackets in strings, comments and regexes", () => {', // 8
    "  const s = \"})\" + '({';", // 9
    "  // })", // 10
    "  /* }) */", // 11
    "  expect(s).toMatch(/\\)\\}[)]/);", // 12
    ["  const t = `})$", "{({ a: 1 }).a}$", "{`(`}`;"].join(""), // 13
    "  return render(<p>Don't stop (yet)</p>, <Row x={1} />);", // 14
    "});", // 15
    "for (const c of cases) it(c.name, () => {", // 16
    "  expect(c.got).toBe(c.want);", // 17
    "}, 30_000);", // 18
    "const total = 4 / 2;", // 19
  ].join("\n");

  it("follows the brackets the test's line opens to where they close", () => {
    expect(testEnd(source, 2)).toBe(4);
    expect(testEnd(source, 5)).toBe(5);
    expect(testEnd(source, 6)).toBe(7);
    expect(testEnd(source, 8)).toBe(15);
    expect(testEnd(source, 16)).toBe(18);
    expect(testEnd(source, 19)).toBe(19);
  });
});

describe("casesOf: each test bun's JUnit report lists", () => {
  it("reads the file, line, name and outcome of each test", () => {
    const junit = `<testsuites><testsuite name="t.test.ts" file="t.test.ts">
      <testcase name="ok &amp; fine" classname="" file="t.test.ts" line="3" assertions="1" />
      <testcase name="broken" classname="outer" file="t.test.ts" line="7" assertions="1">
        <failure type="AssertionError" />
      </testcase>
      <testcase name="off" classname="" file="t.test.ts" line="9" assertions="0"><skipped /></testcase>
    </testsuite></testsuites>`;
    expect(casesOf(junit)).toEqual([
      { file: "t.test.ts", line: 3, name: "ok & fine", outcome: "passed" },
      { file: "t.test.ts", line: 7, name: "broken", outcome: "failed" },
      { file: "t.test.ts", line: 9, name: "off", outcome: "skipped" },
    ]);
  });
});

describe("missingOnMain: what a test file that can't load on main's code lacks", () => {
  const main = "/scratch/main";
  it("names a missing export and the file bun looked in", () => {
    const out = `# Unhandled error between tests\nSyntaxError: Export named 'added' not found in module '${main}/apps/x/src/old.ts'.`;
    expect(missingOnMain(out, main)).toEqual({
      export: "added",
      file: "apps/x/src/old.ts",
    });
  });
  it("names a missing module and the file that imported it", () => {
    const out = `error: Cannot find module '../src/fresh' from '${main}/apps/x/test/fresh.test.ts'`;
    expect(missingOnMain(out, main)).toEqual({
      module: "../src/fresh",
      from: "apps/x/test/fresh.test.ts",
    });
  });
  it("names nothing for any other failure to load", () => {
    expect(missingOnMain("error: boom", main)).toBeUndefined();
  });
});

describe("the mark on a test that already passes on main", () => {
  it("reads the reason after the mark, and only a mark with a reason", () => {
    expect(markOn(`  it("x", () => { ${MARK} the route existed`)).toBe(
      "the route existed",
    );
    expect(markOn(`  ${MARK}   `)).toBeUndefined();
    expect(markOn('  it("x", () => {')).toBeUndefined();
  });

  it("shows Devesh each mark a change adds to a test file, and asks the PR body to copy it", () => {
    const added = [
      {
        file: "apps/x/test/a.test.ts",
        line: 4,
        text: `${MARK} kept as a guard`,
      },
      { file: "apps/x/src/a.ts", line: 2, text: `${MARK} not a test file` },
      { file: "scripts/done-gate-x.test.ts", line: 1, text: `${MARK} quoted` },
    ];
    expect(markNotes(added)).toEqual([
      'test marked "behaviour already on main" at apps/x/test/a.test.ts:4: kept as a guard',
    ]);
    expect(markBodyProblems(added, "Roadmap: off-roadmap — x")).toEqual([
      'the PR body doesn\'t show the test marked "behaviour already on main" at apps/x/test/a.test.ts:4: add the line `Behaviour already on main: apps/x/test/a.test.ts · kept as a guard`',
    ]);
    expect(
      markBodyProblems(
        added,
        "x\nBehaviour already on main: apps/x/test/a.test.ts · kept as a guard\n",
      ),
    ).toEqual([]);
  });
});

/** Writes files into a folder, making the folders they need. */
const put = (dir: string, files: Record<string, string>) => {
  for (const [f, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), body);
  }
};
const sh = (dir: string, cmd: string[]) =>
  spawnSync(cmd[0] as string, cmd.slice(1), { cwd: dir, encoding: "utf8" });

const OLD = "export const old = () => 1;\n";
const OLD_TEST = `import { expect, it } from "bun:test";
import { old } from "../src/old";

it("old works", () => {
  expect(old()).toBe(1);
});
`;

/**
 * A throwaway repo: main holds a tiny product (apps/x/src/old.ts) and its test, origin/main points at it, and the
 * change is written into the working tree, as an agent leaves it before committing.
 */
function scratch(change: Record<string, string>) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "tests-proven-")));
  dirs.push(dir);
  put(dir, {
    "package.json": '{ "name": "scratch", "private": true }\n',
    "apps/x/src/old.ts": OLD,
    "apps/x/test/old.test.ts": OLD_TEST,
  });
  sh(dir, ["git", "init", "-q", "-b", "main"]);
  sh(dir, ["git", "add", "-A"]);
  sh(dir, [
    "git",
    "-c",
    "user.email=t@t",
    "-c",
    "user.name=t",
    "commit",
    "-qm",
    "main",
  ]);
  sh(dir, ["git", "update-ref", "refs/remotes/origin/main", "HEAD"]);
  put(dir, change);
  return dir;
}

const prove = (
  dir: string,
  isMoved?: (file: string, line: number) => boolean,
) => testsProven(dir, snapshot(dir), isMoved);

describe("testsProven on a throwaway repo", () => {
  it("accepts a test of a brand-new file: it can't load on main, the file is new product code, and the test runs an added line of it", () => {
    const r = prove(
      scratch({
        "apps/x/src/fresh.ts": "export const fresh = (n: number) => n + 1;\n",
        "apps/x/test/fresh.test.ts": `import { expect, it } from "bun:test";
import { fresh } from "../src/fresh";

it("adds one", () => {
  expect(fresh(1)).toBe(2);
});
`,
      }),
    );
    expect(r.text).toContain("Tests proven ✓ 1 of 1 new or edited test(s)");
    expect(r.ok).toBe(true);
  });

  it("accepts a test of a new export in an old file, added to that file's old test file", () => {
    const r = prove(
      scratch({
        "apps/x/src/old.ts": `${OLD}
export function doubled(n: number) {
  return n * 2;
}
`,
        "apps/x/test/old.test.ts": OLD_TEST.replace(
          "{ old }",
          "{ doubled, old }",
        ).concat(`
it("doubles", () => {
  expect(doubled(2)).toBe(4);
});
`),
      }),
    );
    expect(r.text).toContain("Tests proven ✓ 1 of 1 new or edited test(s)");
    expect(r.ok).toBe(true);
  });

  it("refuses a test whose only missing import is a new test helper: the helper comes along to main's code, where the test passes, so it tests nothing this change adds", () => {
    const r = prove(
      scratch({
        "apps/x/src/old.ts": `${OLD}export const unused = 2;\n`, // the change has product code
        "apps/x/test/make-old.ts":
          'import { old } from "../src/old";\nexport const makeOld = () => old();\n',
        "apps/x/test/helper.test.ts": `import { expect, it } from "bun:test";
import { makeOld } from "./make-old";

it("makes one", () => {
  expect(makeOld()).toBe(1);
});
`,
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.text).toContain(
      'apps/x/test/helper.test.ts:4 "makes one" passes on main\'s code too',
    );
  });

  // A helper or fixture neither product code nor in a test folder, by today's product list and by the done-rules
  // item's wider one, comes along to main's code too: a missing helper or fixture never counts.
  it("refuses a test that imports a new helper outside a test folder: the helper comes along to main's code, where the test passes", () => {
    const imported = prove(
      scratch({
        "apps/x/src/old.ts": `${OLD}export const unused = 2;\n`,
        "docs/fixtures/rows.ts": "export const rows = [1, 2];\n",
        "apps/x/test/rows.test.ts": `import { expect, it } from "bun:test";
import { rows } from "../../../docs/fixtures/rows";

it("has two rows", () => {
  expect(rows.length).toBe(2);
});
`,
      }),
    );
    expect(imported.ok).toBe(false);
    expect(imported.text).toContain(
      'apps/x/test/rows.test.ts:4 "has two rows" passes on main\'s code too',
    );
  });

  it("refuses a test that reads a new fixture from disk outside a test folder: the fixture comes along to main's code, so the test can't throw there for want of it", () => {
    const read = prove(
      scratch({
        "apps/x/src/old.ts": `${OLD}export const unused = 2;\n`,
        "docs/fixtures/rows.json": "[1, 2, 3]\n",
        "apps/x/test/rows.test.ts": `import { expect, it } from "bun:test";
import { readFileSync } from "node:fs";

it("reads three rows", () => {
  const rows = JSON.parse(readFileSync(\`\${import.meta.dir}/../../../docs/fixtures/rows.json\`, "utf8"));
  expect(rows.length).toBe(3);
});
`,
      }),
    );
    expect(read.ok).toBe(false);
    expect(read.text).toContain(
      'apps/x/test/rows.test.ts:4 "reads three rows" passes on main\'s code too',
    );
  });

  it("refuses a test that can't load on main for a new export but runs none of the change's added lines", () => {
    const r = prove(
      scratch({
        "apps/x/src/old.ts": `${OLD}
export function doubled(n: number) {
  return n * 2;
}
`,
        "apps/x/test/old.test.ts": OLD_TEST.replace(
          "{ old }",
          "{ doubled, old }",
        ).concat(`
it("has doubled", () => {
  expect(typeof doubled).toBe("function");
});
`),
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.text).toContain(
      "runs none of the lines this change adds to apps/x/src/old.ts",
    );
  });

  it("accepts a test that fails on main by an assertion or by throwing, and refuses one that fails on the change", () => {
    const change = (wantOnChange: number) => ({
      "apps/x/src/old.ts": "export const old = () => 7;\n",
      "apps/x/test/old.test.ts": `${OLD_TEST}
it("is seven", () => {
  expect(old()).toBe(${wantOnChange});
});

it("throws on main", () => {
  if (old() !== 7) throw new Error("not seven");
});
`,
    });
    const good = prove(scratch(change(7)));
    expect(good.text).toContain("Tests proven ✓ 2 of 2 new or edited test(s)");
    expect(good.ok).toBe(true);
    const bad = prove(scratch(change(8)));
    expect(bad.ok).toBe(false);
    expect(bad.text).toContain(
      'apps/x/test/old.test.ts:8 "is seven" fails on this change',
    );
  });

  it("refuses a new test that passes on main, and accepts it once its line says why, for Devesh to see", () => {
    const test = (mark: string) => ({
      "apps/x/src/old.ts": `${OLD}export const unused = 2;\n`,
      "apps/x/test/old.test.ts": `${OLD_TEST}
it("still one", () => {${mark}
  expect(old()).toBe(1);
});
`,
    });
    const bare = prove(scratch(test("")));
    expect(bare.ok).toBe(false);
    expect(bare.text).toContain(
      'apps/x/test/old.test.ts:8 "still one" passes on main\'s code too',
    );
    const marked = prove(scratch(test(` ${MARK} a guard for the old rule`)));
    expect(marked.ok).toBe(true);
    expect(marked.text).toContain(
      'test marked "behaviour already on main" at apps/x/test/old.test.ts:8: a guard for the old rule',
    );
  });

  it("judges only the tests whose own lines the change adds or edits", () => {
    // The old test passes on main and is untouched; the new import line sits outside every test.
    const r = prove(
      scratch({
        "apps/x/src/old.ts":
          "export const old = () => 1;\nexport const two = () => 2;\n",
        "apps/x/test/old.test.ts": OLD_TEST.replace(
          "{ old }",
          "{ old, two }",
        ).concat(`
it("two", () => {
  expect(two()).toBe(2);
});
`),
      }),
    );
    expect(r.text).toContain("Tests proven ✓ 1 of 1 new or edited test(s)");
  });

  it("exempts a change with no product code, and moved lines", () => {
    const noProduct = prove(
      scratch({
        "apps/x/test/old.test.ts": `${OLD_TEST}
it("still one", () => {
  expect(old()).toBe(1);
});
`,
      }),
    );
    expect(noProduct.ok).toBe(true);
    expect(noProduct.text).toContain("no product code changed");
    // A stand-in for the done-rules item's moved-code detection: every line of the test file moved.
    const moved = prove(
      scratch({
        "apps/x/src/old.ts": `${OLD}export const unused = 2;\n`,
        "apps/x/test/moved.test.ts": OLD_TEST,
      }),
      (file) => file === "apps/x/test/moved.test.ts",
    );
    expect(moved.ok).toBe(true);
    expect(moved.text).toContain("no test added or edited");
  });

  it("runs as `bun run gate proven`, failing with the reason", () => {
    const dir = scratch({
      "apps/x/src/old.ts": `${OLD}export const unused = 2;\n`,
      "apps/x/test/old.test.ts": `${OLD_TEST}
it("still one", () => {
  expect(old()).toBe(1);
});
`,
    });
    // The gate, and the roadmap reader it shares with the tracker.
    for (const f of [
      "scripts/done-gate.ts",
      "scripts/done-gate",
      "docs/tracker/parse.js",
    ])
      cpSync(join(import.meta.dir, "..", f), join(dir, f), { recursive: true });
    const r = sh(dir, [process.execPath, "scripts/done-gate.ts", "proven"]);
    expect(r.stdout).toContain(
      'apps/x/test/old.test.ts:8 "still one" passes on main\'s code too',
    );
    expect(r.status).toBe(1);
  });
});
