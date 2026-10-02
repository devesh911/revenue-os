// The done gate (scripts/done-gate.ts). Rules: each one fires on the kind of change that has already
// reached main looking finished (a throwing stub, an export nothing calls, a test that reads source
// text) and stays quiet on clean code. Hook flow: the real hook runs inside a throwaway git repo, with
// the checks' result pre-seeded in its cache so no typecheck/test suite runs here. `gate rules` and the
// shared-stack lock run the same way, in throwaway repos.
import { afterAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { parseDiff } from "./done-gate/diff";
import { usesExport } from "./done-gate/export-users";
import { mergeOf } from "./done-gate/merge-gate";
import { checkRules, RULE_FILES } from "./done-gate/rules";
import { onSharedStack } from "./done-gate/shared-stack";
import { simpleCommands } from "./done-gate/shell-words";

const GATE = join(import.meta.dir, "done-gate.ts");
// A hook test starts bun and git a dozen times; with other agents busy on the machine that passes bun's 5 s.
setDefaultTimeout(30_000);
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const sh = (
  dir: string,
  cmd: string[],
  env: Record<string, string> = {},
  input?: string,
) =>
  spawnSync(cmd[0] as string, cmd.slice(1), {
    cwd: dir,
    env: { ...process.env, ...env },
    input,
    encoding: "utf8",
  });

const commitAll = (dir: string) => {
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

/** A commit made before the session started, as a teammate's or an earlier session's would be. */
const commitOld = (dir: string) => {
  sh(dir, ["git", "add", "-A"]);
  sh(
    dir,
    [
      "git",
      "-c",
      "user.email=t@t",
      "-c",
      "user.name=t",
      "commit",
      "-qm",
      "old",
    ],
    { GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z" },
  );
};

/** A throwaway repo on `main` holding a copy of the gate and nothing else. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), "done-gate-"));
  dirs.push(dir);
  mkdirSync(join(dir, "scripts"));
  copyFileSync(GATE, join(dir, "scripts", "done-gate.ts"));
  cpSync(
    join(import.meta.dir, "done-gate"),
    join(dir, "scripts", "done-gate"),
    { recursive: true },
  );
  writeFileSync(join(dir, "STATE.md"), "# State\n");
  sh(dir, ["git", "init", "-q", "-b", "main"]);
  commitOld(dir);
  return dir;
}

const write = (dir: string, file: string, body: string) => {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), body);
};

const add = (file: string, ...lines: string[]) =>
  lines.map((text, i) => ({ file, line: i + 1, text }));
const nobody = () => [];
const problemsOf = (
  added: ReturnType<typeof add>,
  usersOf: (name: string, file: string) => string[] = nobody,
) =>
  checkRules([...new Set(added.map((a) => a.file))], added, usersOf).problems;

describe("parseDiff", () => {
  it("lists touched files and numbers each added line, skipping headers and removals", () => {
    const diff = [
      "diff --git a/apps/x/src/a.ts b/apps/x/src/a.ts",
      "--- a/apps/x/src/a.ts",
      "+++ b/apps/x/src/a.ts",
      "@@ -3,0 +4,2 @@ export const x = 1;",
      "+const y = 2;",
      "++i;",
      "diff --git a/old.ts b/old.ts",
      "deleted file mode 100644",
      "--- a/old.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-gone",
    ].join("\n");
    expect(parseDiff(diff)).toEqual({
      files: ["apps/x/src/a.ts", "old.ts"],
      added: [
        { file: "apps/x/src/a.ts", line: 4, text: "const y = 2;" },
        { file: "apps/x/src/a.ts", line: 5, text: "+i;" },
      ],
    });
  });
});

describe("checkRules", () => {
  it("blocks switching the type checker off, and shows Devesh every explained exception", () => {
    expect(
      problemsOf(
        add("services/worker/src/a.ts", "// @ts-ignore", "const a = 1;"),
      ),
    ).toEqual([
      "services/worker/src/a.ts:1 switches the type checker off without a reason; fix the cause instead",
    ]);
    const lint = add(
      "packages/harness/src/workflow/schema.ts",
      "// biome-ignore-all lint/suspicious/noThenProperty: `then` is a workflow step field",
    );
    expect(checkRules([], lint, nobody)).toEqual({
      problems: [],
      notes: [
        "checker silenced at packages/harness/src/workflow/schema.ts:1: lint/suspicious/noThenProperty: `then` is a workflow step field",
      ],
    });
  });

  it("blocks skipped and singled-out tests", () => {
    // bun also runs *_test.* and *_spec.* files, wherever they live
    for (const f of [
      "services/worker/src/queue_test.ts",
      "packages/db/src/rls_spec.ts",
    ])
      expect(
        problemsOf(add(f, 'test.skip("x", () => {});')).some((p) =>
          p.includes("skips or singles out a test"),
        ),
      ).toBe(true);
    expect(
      problemsOf(
        add("services/worker/test/a.test.ts", 'it.skip("x", () => {});'),
      ),
    ).toHaveLength(1);
    expect(
      problemsOf(
        add("apps/console/e2e/a.e2e.ts", 'test.only("x", async () => {});'),
      ),
    ).toHaveLength(1);
  });

  it("blocks conditional and runner-specific skips too", () => {
    for (const line of [
      'it.skipIf(true)("x", () => {});',
      'it.runIf(false)("x", () => {});',
      'test.todoIf(true)("x");',
      'test.if(false)("x", () => {});',
      'describe.skipIf(!hasDb)("db", () => {});',
      'test.fixme("x", async () => {});', // Playwright
      'test.describe.fixme("x", () => {});',
      'test.fail("x", async () => {});',
      'test.failing("x", () => {});',
      'it.skip.each([1])("x %d", () => {});',
    ])
      expect(problemsOf(add("apps/console/e2e/a.e2e.ts", line))).toEqual([
        "apps/console/e2e/a.e2e.ts:1 skips or singles out a test; every test must run",
      ]);
    for (const line of [
      'it("x", () => {});',
      'test.each([1])("x %d", () => {});',
      'describe("runs if the key is set", () => {});',
      "const skipIf = hasDb;",
    ])
      expect(problemsOf(add("apps/console/e2e/a.e2e.ts", line))).toEqual([]);
  });

  it("blocks a skip behind bun's concurrent or serial, or picked as a value (bun 1.3.11 skips each of these)", () => {
    const test = "services/worker/test/a.test.ts";
    for (const line of [
      'test.concurrent.skip("f", async () => {});',
      'test.serial.skip("g", () => {});',
      'describe.concurrent.skip("h", () => {});',
      'it.concurrent.only("x", async () => {});',
      'test.describe.serial.only("x", () => {});', // Playwright
      "const maybe = process.env.NOPE ? describe : describe.skip;",
      "const run = hasDb ? it : xit;",
      'test["skip"]("k", () => {});',
      'const r = /a\\//; test.skip("x", () => {}); // a regex, then a comment',
    ])
      expect(problemsOf(add(test, line))).toEqual([
        `${test}:1 skips or singles out a test; every test must run`,
      ]);
    for (const line of [
      'test.concurrent("x", async () => {});',
      'describe.serial("x", () => {});',
      "const skipped = results.filter((r) => r.skip).length;",
      "expect(/only/.test(text)).toBe(true);",
      "forbidOnly: !!process.env.CI, // fail CI if a stray test.only was committed",
      'const url = "https://x.test/a"; /* describe.skip is banned */',
    ])
      expect(problemsOf(add(test, line))).toEqual([]);
  });

  it("leaves alone code that skips no test: product code, comment lines, and a local variable named like the runner", () => {
    const scen = add(
      "services/worker/src/fn/scen.ts",
      "for (const test of rows) if (test.skip) continue;",
      "return rows.filter((it) => !it.only);",
      "function pick(test: Scenario) {",
      "  return test.only ? [test] : [];", // `test` is a parameter from the line above
    );
    expect(problemsOf(scen)).toEqual([]);
    const test = "services/worker/test/doc.test.ts";
    for (const line of [
      " * Every case here must run: no test.only or describe.skip here",
      "/* Every case here must run: no test.only",
      "for (const test of rows) if (test.skip) continue;",
      "const kept = rows.filter((it) => !it.only);",
      "const late = cases.find((it) => it.todo);",
    ])
      expect(problemsOf(add(test, line))).toEqual([]);
    for (const line of [
      "const it = hasDb ? test : test.skip;", // binds `it`, but switches `test` off
      ' * doc */ describe.skip("x", () => {});',
    ])
      expect(problemsOf(add(test, line))).toEqual([
        `${test}:1 skips or singles out a test; every test must run`,
      ]);
  });

  it("blocks tests that read source code as text, but not config, fixtures or build output", () => {
    const test = "apps/console/test/home.test.tsx";
    expect(
      problemsOf(
        add(
          test,
          'const HOME_SRC = "apps/console/src/pages/Home.tsx";',
          "expect(await Bun.file(HOME_SRC).text()).toMatch(/<DataShell/);",
        ),
      ),
    ).toEqual([
      `${test}:2 reads source code as text; test what the code does (render it, call it, drive it), not what it says`,
    ]);
    expect(
      problemsOf(
        add(
          "tests/gitleaks-config.test.ts",
          'import { parseCsv } from "../packages/shared/src/csv";',
          'const config = readFileSync(".gitleaks.toml", "utf8");',
          'const rows = JSON.parse(readFileSync("fixtures/leads.json", "utf8"));',
          'readFileSync(resolve(assetsDir, f), "utf8").includes(HERO)',
          'const pkg = await Bun.file(join(import.meta.dir, "../package.json")).json();',
        ),
      ),
    ).toEqual([]);
  });

  it("blocks a throwing placeholder on a product path unless STATE.md lists it as Stub", () => {
    const stub = add(
      "services/worker/src/jobs.ts",
      '  throw new Error(what + " not wired (stub — the real adapter comes later)");',
    );
    expect(problemsOf(stub)).toHaveLength(1);
    const listed = [
      ...stub,
      ...add(
        "STATE.md",
        "| Voice | Place a real phone call | Stub | jobs.ts throws |",
      ),
    ];
    expect(problemsOf(listed)).toEqual([]);
  });

  it("reads a throw the formatter wrapped over several lines as one statement, and knows NotImplementedError", () => {
    const file = "services/worker/src/sms.ts";
    const wrapped = add(
      file,
      "  throw new Error(",
      '    "sendSms: the SMS provider is not implemented yet, see STATE.md",',
      "  );",
    );
    expect(problemsOf(wrapped)).toEqual([
      `${file}:1 adds a placeholder that throws; build the real thing, or list it as Stub in STATE.md → What works today in this same change`,
    ]);
    expect(
      problemsOf(add(file, "  throw new NotImplementedError();")),
    ).toHaveLength(1);
    expect(
      problemsOf(
        add(
          file,
          "class NotImplementedError extends Error {}",
          "  throw new Error(",
          '    "the provider refused the number",',
          "  );",
        ),
      ),
    ).toEqual([]);
  });

  it("blocks an export that nothing outside tests uses", () => {
    const file = "packages/harness/src/planner.ts";
    const exp = add(file, "export async function planNextStep(ctx: Ctx) {");
    expect(problemsOf(exp)).toEqual([
      `${file}:1 exports planNextStep, but nothing outside tests uses it; land it together with the code that calls it`,
    ]);
    const only = (...users: string[]) => problemsOf(exp, () => users);
    expect(only("packages/harness/test/planner.test.ts")).toHaveLength(1);
    expect(only("services/worker/src/handlers/agent-turn.ts")).toEqual([]);
    expect(only(file)).toEqual([]); // used inside its own file, exported for its test
  });

  it("reads only code as a throw: a comment that says throw, or a finished throw, starts no statement", () => {
    const file = "services/worker/src/jobs.ts";
    expect(
      problemsOf(
        add(
          file,
          "// Boot stays green because building one is not a throw.",
          "// ponytail: live-telephony stub; the real adapter comes later",
          '  if (!id) throw new Error("missing id"); // validated at the webhook',
          '  return mode === "stub" ? fake : real;',
        ),
      ),
    ).toEqual([]);
  });

  it("finds a done-gate: allow marker the formatter left after a wrapped throw", () => {
    const file = "services/worker/src/routes.ts";
    const { problems, notes } = checkRules(
      [file],
      add(
        file,
        "  throw new Error(",
        '    "GET is not implemented by this endpoint, by design (answer 501)",',
        "  ); // done-gate: allow a deliberate 501",
      ),
      nobody,
    );
    expect(problems).toEqual([]);
    expect(notes).toEqual([`exception at ${file}:1 (a deliberate 501)`]);
  });

  it("blocks a default export or an export list that nothing outside tests uses", () => {
    const page = "apps/console/src/pages/Billing.tsx";
    expect(
      problemsOf(add(page, "export default function BillingPage() {")),
    ).toEqual([
      `${page}:1 exports a default, but nothing outside tests uses it; land it together with the code that calls it`,
    ]);
    const file = "services/worker/src/invoice.ts";
    expect(
      problemsOf(add(file, "export { formatInvoice, total as sum };")),
    ).toEqual([
      `${file}:1 exports formatInvoice, but nothing outside tests uses it; land it together with the code that calls it`,
    ]);
    expect(
      problemsOf(add(page, "export default BillingPage;"), () => [
        "apps/console/src/routes.tsx",
      ]),
    ).toEqual([]);
    const wrapped = add(
      file,
      "export {",
      "  scheduleFollowUpCall,",
      "  cancelFollowUpCall,",
      "};",
    ); // the formatter's shape for a list longer than a line
    expect(problemsOf(wrapped)).toEqual([
      `${file}:1 exports scheduleFollowUpCall, but nothing outside tests uses it; land it together with the code that calls it`,
    ]);
  });

  it("leaves scripts, docs and this gate's own files alone", () => {
    expect(
      problemsOf(add("scripts/seed.ts", "export function seedPack() {")),
    ).toEqual([]);
    expect(
      problemsOf(add("AGENTS.md", "Never use `.skip(` or `@ts-ignore`.")),
    ).toEqual([]);
    expect(
      problemsOf(add("scripts/done-gate.test.ts", '"// @ts-ignore"')),
    ).toEqual([]);
  });

  it("turns a marked exception into a note Devesh sees, and flags changes to what done means", () => {
    const added = [
      ...add(
        "services/worker/test/vapi.test.ts",
        'it.skip("replays the live webhook", () => {}); // done-gate: allow Vapi sandbox down (#120)',
      ),
      ...add(
        "services/worker/src/vapi/tools.ts",
        "export function onToolCall() {} // mid-call tools (done-gate: allow Vapi calls it, not our code)",
      ),
    ];
    const r = checkRules(
      [
        ...new Set(added.map((a) => a.file)),
        ".github/workflows/ci.yml",
        ".codex/hooks.json",
      ],
      added,
      nobody,
    );
    expect(r.problems).toEqual([]);
    expect(r.notes).toEqual([
      "exception at services/worker/test/vapi.test.ts:1 (Vapi sandbox down (#120))",
      "exception at services/worker/src/vapi/tools.ts:1 (Vapi calls it, not our code)",
      'changed what "done" means: .github/workflows/ci.yml, .codex/hooks.json',
    ]);
  });

  it("names Devesh as code owner of every file it treats as deciding what done means", () => {
    const root = join(import.meta.dir, "..");
    const owned = join(mkdtempSync(join(tmpdir(), "done-gate-owners-")), "p");
    dirs.push(dirname(owned));
    // CODEOWNERS patterns follow .gitignore's rules, so git itself can say which files they match.
    writeFileSync(
      owned,
      readFileSync(join(root, ".github", "CODEOWNERS"), "utf8")
        .split("\n")
        .map((l) => l.replace(/#.*/, "").trim().split(/\s+/)[0] ?? "")
        .filter(Boolean)
        .join("\n"),
    );
    const rules = sh(root, ["git", "ls-files"])
      .stdout.split("\n")
      .filter((f) => RULE_FILES.test(f));
    expect(rules).toContain("bunfig.toml");
    const matched = sh(
      root,
      [
        "git",
        "-c",
        `core.excludesFile=${owned}`,
        "check-ignore",
        "--no-index",
        "--stdin",
      ],
      {},
      rules.join("\n"),
    ).stdout;
    expect(rules.filter((f) => !matched.split("\n").includes(f))).toEqual([]);
  });
});

describe("reading a shell command: which gh pr merge it runs", () => {
  const merges = (line: string) =>
    simpleCommands(line)
      .map(mergeOf)
      .filter(Boolean)
      .map((m) => m?.pr ?? "(none)");

  it("finds a merge only where the command runs one, not where text mentions it", () => {
    expect(merges('grep -rn "gh pr merge" scripts AGENTS.md')).toEqual([]);
    expect(
      merges('git commit -qm "refuse an agent gh pr merge unless proven"'),
    ).toEqual([]);
    expect(
      merges(
        "git commit -F - <<'EOF'\nWhy\ngh pr merge 7 is refused now\nEOF\ngit log -1",
      ),
    ).toEqual([]); // a heredoc is text
    expect(
      merges('gh pr create --body "Step 5: gh pr merge is refused"'),
    ).toEqual([]);
    expect(
      merges("cd ../w && gh pr merge 12 --squash --delete-branch"),
    ).toEqual(["12"]);
    expect(merges("gh pr merge 7 --squash && gh pr merge 9 --squash")).toEqual([
      "7",
      "9",
    ]);
    expect(merges("GH_TOKEN=x /opt/homebrew/bin/gh pr -R o/r merge 9")).toEqual(
      ["9"],
    );
  });

  it("takes the pull request from where gh does: the first word after merge that no option owns", () => {
    expect(merges('gh pr merge --squash --body "Fixes 7 flaky tests"')).toEqual(
      ["(none)"],
    );
    expect(merges('gh pr merge "7" --squash')).toEqual(["7"]);
    expect(merges("gh pr merge --squash -t 'Release 2' feat/x")).toEqual([
      "feat/x",
    ]);
    expect(merges("gh pr merge --squash --delete-branch\nsleep 7")).toEqual([
      "(none)",
    ]);
    expect(
      mergeOf(
        simpleCommands(
          "gh pr merge https://github.com/o/r/pull/5 --auto --match-head-commit=abc1234",
        )[0] ?? [],
      ),
    ).toMatchObject({ pr: "https://github.com/o/r/pull/5", head: "abc1234" });
  });
});

describe("usesExport: who counts as using an export", () => {
  it("counts a default export used by a default import, `default as`, or an import() of its module", () => {
    const page = "apps/console/src/pages/Billing.tsx";
    const routes = "apps/console/src/routes.tsx";
    const by = (source: string, from = routes) =>
      usesExport(source, from, page, "default");
    expect(by('import Billing from "./pages/Billing";\n')).toBe(true);
    expect(by('import Billing, { plans } from "./pages/Billing.tsx";\n')).toBe(
      true,
    );
    expect(by('import { default as Billing } from "./pages/Billing";\n')).toBe(
      true,
    );
    expect(by('const Billing = lazy(() => import("./pages/Billing"));\n')).toBe(
      true,
    );
    expect(by('import { Billing } from "./pages/Billing";\n')).toBe(false);
    expect(by('import Billing from "./pages/Other";\n')).toBe(false);
    expect(
      by("export default function BillingPage() {}\nBillingPage();\n", page),
    ).toBe(false);
  });

  it("counts a name exported by a list only for a use beyond its declaration and the list", () => {
    const file = "services/worker/src/invoice.ts";
    const own = (source: string) =>
      usesExport(source, file, file, "formatInvoice");
    expect(
      own("function formatInvoice() {}\nexport { formatInvoice };\n"),
    ).toBe(false);
    expect(
      own(
        "function formatInvoice() {}\nexport { formatInvoice };\nconst t = formatInvoice();\n",
      ),
    ).toBe(true);
    expect(
      own(
        'import { formatInvoice } from "./format";\nexport { formatInvoice };\n',
      ),
    ).toBe(false); // passed on, not used here
  });

  const file = "services/worker/src/jobs.ts";
  const other = "services/worker/src/handlers/run.ts";
  const uses = (source: string, from = other, owner = file, name = "x") =>
    usesExport(source, from, owner, name);

  it("counts a file that imports the name from that module, not one that merely contains the word", () => {
    for (const name of ["x", "config", "handler"]) {
      const by = (source: string, from = other) =>
        usesExport(source, from, file, name);
      expect(by(`const ${name} = load();\nfoo.${name} = 1; // ${name}\n`)).toBe(
        false,
      );
      expect(by(`import { ${name} } from "./other";\n${name}();\n`)).toBe(
        false,
      );
      expect(by(`import { ${name} } from "dotenv";\n`)).toBe(false);
      expect(by(`import { a, ${name} } from "../jobs";\n`)).toBe(true);
      expect(
        by(
          `import {\n  a,\n  // the one we need\n  type B,\n  ${name} as mine,\n} from "../jobs.ts";\n`,
        ),
      ).toBe(true);
      expect(by(`import def, { ${name} } from "../jobs";\n`)).toBe(true);
      expect(
        by(`export { ${name} } from "./jobs";\n`, "services/worker/src/x.ts"),
      ).toBe(true);
      expect(by(`import * as jobs from "../jobs";\njobs.${name}();\n`)).toBe(
        true,
      );
      expect(by(`import * as jobs from "../jobs";\njobs.other();\n`)).toBe(
        false,
      );
      expect(by(`import * as j from "../other";\nj.${name}();\n`)).toBe(false);
    }
  });

  it("counts the exporting file itself only when it uses the name beyond its declaration", () => {
    for (const name of ["x", "config", "handler"]) {
      const own = (source: string) => usesExport(source, file, file, name);
      expect(own(`export const ${name} = 1;\n`)).toBe(false);
      expect(
        own(
          `export const ${name}: number = 1;\nconst p = { ${name}: 2 };\np.${name} = 3;\n/* ${name} */ log("${name}");\nfunction f(${name}?: string) {}\n`,
        ),
      ).toBe(false);
      expect(own(`export const ${name} = 1;\nrun(${name});\n`)).toBe(true);
      expect(
        own(`export function ${name}() {}\nexport default ${name};\n`),
      ).toBe(true);
    }
  });

  it("counts the exporting file's own use in a ternary, a case, or after a string holding /*", () => {
    for (const name of ["x", "config", "handler"]) {
      const own = (source: string) => usesExport(source, file, file, name);
      expect(
        own(
          `export const ${name} = 500;\nconst n = wanted > 500 ? ${name} : wanted;\n`,
        ),
      ).toBe(true);
      expect(
        own(
          `export const ${name} = 500;\nconst n = wanted > 500\n  ? ${name}\n  : wanted;\n`,
        ),
      ).toBe(true);
      expect(
        own(
          `export const ${name} = 1;\nswitch (v) {\n  case ${name}:\n    break;\n}\n`,
        ),
      ).toBe(true);
      expect(
        own(
          `export const ACCEPT = "image/*";\nexport const ${name} = 5;\nif (size > ${name}) throw new Error("big");\n/** doc */\n`,
        ),
      ).toBe(true);
      expect(
        own(
          `export const ${name} = 1;\ntype T = { a: string; ${name}?: number };\nconst o = {\n  a: 1,\n  ${name}: 2,\n};\n`,
        ),
      ).toBe(false);
    }
    expect(
      uses('const glob = "src/*";\nimport { x } from "../jobs";\n/** doc */\n'),
    ).toBe(true);
  });

  it("counts a dynamic import, a namespace used whole or destructured, and an import through a barrel", () => {
    const late = "services/worker/src/probe/late.ts";
    const boot = "services/worker/src/boot.ts";
    const dyn = (source: string) => usesExport(source, boot, late, "warmCache");
    expect(
      dyn(
        'const { warmCache } = await import("./probe/late");\nawait warmCache();\n',
      ),
    ).toBe(true);
    expect(
      dyn(
        'const late = await import("./probe/late.ts");\nawait late.warmCache();\n',
      ),
    ).toBe(true);
    expect(dyn('const { warmCache } = await import("./probe/early");\n')).toBe(
      false,
    );
    expect(dyn('await import("./probe/late");\n')).toBe(false);
    expect(
      uses('import * as jobs from "../jobs";\nconst { x } = jobs;\n'),
    ).toBe(true);
    expect(uses('import * as jobs from "../jobs";\nregister(jobs);\n')).toBe(
      true,
    );
    expect(uses('import * as jobs from "../jobs";\njobs?.x();\n')).toBe(true);
    // services/worker/src/lib.ts holds `export * from "./probe/late"`: a barrel that is not an index file.
    const start = "services/worker/src/boot/start.ts";
    const viaLib = 'import { warmCache } from "../lib";\nwarmCache();\n';
    expect(usesExport(viaLib, start, late, "warmCache")).toBe(false);
    expect(
      usesExport(viaLib, start, late, "warmCache", [
        "services/worker/src/lib.ts",
      ]),
    ).toBe(true);
  });

  it("counts a namespace handed on whole, but not its name as an object key or JSX attribute, nor a destructuring of other names", () => {
    const tools = (source: string, name: string) =>
      usesExport(
        `import * as tools from "./tools";\n${source}\n`,
        "services/worker/src/fn/agent.ts",
        "services/worker/src/fn/tools.ts",
        name,
      );
    const agent = 'export const agent = { name: "a", tools: [tools.lookUp] };';
    expect(tools(agent, "lookUp")).toBe(true);
    expect(tools(agent, "orphanTool")).toBe(false);
    expect(tools("const el = <Panel tools={list} />;", "orphanTool")).toBe(
      false,
    );
    expect(tools("type T = { tools: string };", "orphanTool")).toBe(false);
    expect(tools("export const agent = { tools };", "orphanTool")).toBe(true);
    expect(tools("const t = ready ? tools : none;", "orphanTool")).toBe(true);
    expect(tools("const el = <Panel tools={tools} />;", "orphanTool")).toBe(
      true,
    );
    const jobs = (source: string, name: string) =>
      usesExport(
        `import * as jobs from "./jobs";\n${source}\n`,
        "services/worker/src/fn/usejobs.ts",
        "services/worker/src/fn/jobs.ts",
        name,
      );
    expect(jobs("const { nightly } = jobs;", "nightly")).toBe(true);
    expect(jobs("const { nightly } = jobs;", "hourly")).toBe(false);
    expect(jobs("const { nightly: n, hourly = 1 } = jobs;", "hourly")).toBe(
      true,
    );
    expect(jobs("const { nightly, ...rest } = jobs;", "hourly")).toBe(true);
  });

  it("reads JSX text with apostrophes as text, not as a string that hides the code inside it", () => {
    const total = "apps/console/src/probe/Total.tsx";
    const fmt = "apps/console/src/probe/fmt.ts";
    const jsx = "<p>Don't wait: {fmt.money(n)} is what it's worth</p>";
    expect(
      usesExport(
        `import * as fmt from "./fmt";\nexport const Total = ({ n }: { n: number }) => ${jsx};\n`,
        total,
        fmt,
        "money",
      ),
    ).toBe(true);
    expect(
      usesExport(
        "export function money(n: number) {\n  return String(n);\n}\nexport const T = () => <p>Don't {money(1)} it's</p>;\n",
        fmt,
        fmt,
        "money",
      ),
    ).toBe(true);
    expect(
      usesExport(
        `import * as fmt from "./fmt";\nlog('fmt.money is gone');\n`,
        total,
        fmt,
        "money",
      ),
    ).toBe(false); // a real string still hides nothing
  });

  it("follows a package name or alias only into that package, and a folder import into its index", () => {
    const shared = "packages/shared/src/schemas.ts";
    expect(uses('import { x } from "@revenue-os/shared";', other, shared)).toBe(
      true,
    );
    expect(uses('import { x } from "@shared/schemas";', other, shared)).toBe(
      true,
    );
    expect(uses('import { x } from "@revenue-os/db";', other, shared)).toBe(
      false,
    );
    expect(uses('import { x } from "@revenue-os/shared";')).toBe(false); // jobs.ts is no package
    // packages/channels/src/index.ts: `export * as voice from "./voice"`, so callers write voice.place().
    const voice = "packages/channels/src/voice.ts";
    const caller = "services/worker/src/handlers/place-call.ts";
    const call = (use: string) =>
      usesExport(
        `import { voice } from "@revenue-os/channels";\n${use}\n`,
        caller,
        voice,
        "place",
      );
    expect(call("await voice.place(payload);")).toBe(true);
    expect(call("await voice.hangUp();")).toBe(false);
    expect(
      uses(
        'import { x } from "../ui/primitives";',
        "apps/console/src/pages/Home.tsx",
        "apps/console/src/ui/primitives/Button.tsx",
      ),
    ).toBe(true);
  });
});

type HookOutput = {
  decision?: string;
  reason?: string;
  systemMessage?: string;
};

describe("the hook", () => {
  const hook = (
    dir: string,
    event: string,
    extra: Record<string, unknown> = {},
    env: Record<string, string> = {},
  ) => {
    // Run from this checkout, as a hook would from the project root; the gate hands over to the repo's own copy.
    const r = sh(
      dir,
      ["bun", GATE, "hook"],
      env,
      JSON.stringify({
        hook_event_name: event,
        session_id: "s1",
        cwd: dir,
        ...extra,
      }),
    );
    const out = r.stdout ? (JSON.parse(r.stdout) as HookOutput) : {};
    return {
      status: r.status,
      sentBack: out.decision === "block" || r.status === 2,
      told: out.systemMessage ?? "",
      reason: out.reason ?? r.stderr,
    };
  };
  const QUIET = { status: 0, sentBack: false, told: "", reason: "" };

  const gate = (dir: string, ...args: string[]) =>
    sh(dir, ["bun", "scripts/done-gate.ts", ...args]);

  // What the gate calls "this exact code": every non-ignored file, as a git tree id. Its results live in the
  // repository's shared git folder, which every worktree of it uses.
  function checksPassed(dir: string) {
    const common = sh(dir, [
      "git",
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ]).stdout.trim();
    const index = join(common, `test-index-${Date.now()}`);
    sh(dir, ["git", "add", "-A"], { GIT_INDEX_FILE: index });
    const tree = sh(dir, ["git", "write-tree"], {
      GIT_INDEX_FILE: index,
    }).stdout.trim();
    rmSync(index);
    write(common, `done-gate/checked/${tree}`, "typecheck, 3 tests");
  }
  const verified = (dir: string, cwd: string, note: string) => {
    hook(cwd, "SubagentStart", { agent_type: "verifier" });
    gate(dir, "verdict", "pass", note);
    return hook(cwd, "SubagentStop", { agent_type: "verifier" });
  };
  /** A second checkout of the same repository, in its own folder. */
  const worktree = (dir: string, branch: string) => {
    const wt = mkdtempSync(join(tmpdir(), "done-gate-wt-"));
    dirs.push(wt);
    rmSync(wt, { recursive: true });
    sh(dir, ["git", "worktree", "add", "-qb", branch, wt]);
    return realpathSync(wt);
  };

  it("does nothing outside a git checkout, or when the session changed nothing", () => {
    const outside = mkdtempSync(join(tmpdir(), "done-gate-none-"));
    dirs.push(outside);
    expect(hook(outside, "Stop")).toEqual(QUIET);
    const dir = repo();
    write(dir, "notes.md", "work from before this session\n");
    expect(hook(dir, "SessionStart").status).toBe(0);
    expect(hook(dir, "Stop")).toEqual(QUIET);
  });

  it("sends the agent back on a rule problem, before any check runs", () => {
    const dir = repo();
    write(
      dir,
      "services/worker/src/a.ts",
      "// @ts-ignore\nexport const a = 1;\n",
    );
    const r = hook(dir, "Stop");
    expect(r.sentBack).toBe(true);
    expect(r.reason).toContain(
      "services/worker/src/a.ts:1 switches the type checker off",
    );
    expect(r.told).toContain("Done gate ✗ sent the agent back (1/5)");
  });

  it("counts an export used inside its own file, and sends back one nothing uses", () => {
    const dir = repo();
    write(
      dir,
      "services/worker/src/a.ts",
      "export const internal = 1;\nexport const orphan = 2;\nexport const used = internal + 1;\n",
    );
    write(
      dir,
      "services/worker/src/b.ts",
      'import { used } from "./a";\nconsole.log(used);\n',
    );
    const r = hook(dir, "Stop");
    expect(r.sentBack).toBe(true);
    expect(r.reason).toContain("services/worker/src/a.ts:2 exports orphan");
    expect(r.reason).not.toContain("exports internal");
    expect(r.reason).not.toContain("exports used");
  });

  it("lets a product change through only on the verifier agent's own PASS for that exact code", () => {
    const dir = repo();
    write(dir, "services/worker/src/route.ts", "const route = 1;\n");
    checksPassed(dir);
    expect(hook(dir, "Stop").reason).toContain(
      'Run the verifier agent (Agent tool, subagent_type "verifier")',
    );

    gate(dir, "verdict", "pass", "looks fine to me"); // the builder grading itself: ignored
    expect(hook(dir, "Stop").sentBack).toBe(true);

    hook(dir, "SubagentStart", { agent_type: "verifier" }); // a real verifier starts clean
    expect(
      hook(dir, "SubagentStop", { agent_type: "verifier" }).reason,
    ).toContain("record your ruling");
    gate(dir, "verdict", "pass", "saw the route answer 200 with the new field");
    expect(hook(dir, "SubagentStop", { agent_type: "verifier" }).status).toBe(
      0,
    );

    const ok = hook(dir, "Stop");
    expect(ok.sentBack).toBe(false);
    expect(ok.told).toBe(
      "Done gate ✓ typecheck, 3 tests · verifier PASS: saw the route answer 200 with the new field",
    );
    expect(hook(dir, "Stop")).toEqual(QUIET); // accepted: quiet until the code changes

    write(dir, "services/worker/src/route.ts", "const route = 2;\n");
    checksPassed(dir);
    expect(hook(dir, "Stop").sentBack).toBe(true); // the ruling was for different code
  });

  it("hands a FAIL ruling's findings back to the agent and never accepts it", () => {
    const dir = repo();
    write(dir, "apps/console/src/page.tsx", "const page = 1;\n");
    checksPassed(dir);
    hook(dir, "SubagentStart", { agent_type: "verifier" });
    gate(dir, "verdict", "fail", "the contacts page still shows the old card");
    hook(dir, "SubagentStop", { agent_type: "verifier" });
    const r = hook(dir, "Stop");
    expect(r.sentBack).toBe(true);
    expect(r.reason).toContain(
      "the verifier ruled FAIL: the contacts page still shows the old card",
    );
  });

  it("needs no verifier when no product code changed", () => {
    const dir = repo();
    write(dir, "docs/notes.md", "hello\n");
    checksPassed(dir);
    expect(hook(dir, "Stop").told).toBe(
      "Done gate ✓ typecheck, 3 tests (no product code changed, so no verifier needed)",
    );
  });

  it("lets the agent stop to ask a question, once, marked NOT verified", () => {
    const dir = repo();
    write(dir, "services/worker/src/a.ts", "const a = 1;\n");
    checksPassed(dir);
    gate(dir, "pause", "Which channel first: WhatsApp or voice?");
    expect(hook(dir, "Stop")).toEqual({
      ...QUIET,
      told: "Done gate ⏸ waiting on you: Which channel first: WhatsApp or voice? (the change so far is NOT verified)",
    });
    expect(hook(dir, "Stop").sentBack).toBe(true);
  });

  it("waits while background work runs, and says the change is not checked yet", () => {
    const dir = repo();
    write(dir, "services/worker/src/a.ts", "// @ts-ignore\n");
    expect(
      hook(dir, "Stop", { background_tasks: [{ id: "t1", type: "shell" }] }),
    ).toEqual({
      ...QUIET,
      told: "Done gate ⏳ not checked yet: background work is still running. The first stop after it ends is checked.",
    });
  });

  it("sends a Codex or Claude Code agent back the way both document: exit 0 and JSON, so Devesh's line survives", () => {
    const dir = repo();
    write(dir, "services/worker/src/a.ts", "// @ts-ignore\n");
    // Codex's own Stop input (openai/codex: codex-rs/hooks/schema/generated/stop.command.input.schema.json).
    const r = sh(
      dir,
      ["bun", GATE, "hook"],
      {},
      JSON.stringify({
        session_id: "codex-thread",
        turn_id: "turn-1",
        transcript_path: null,
        cwd: dir,
        hook_event_name: "Stop",
        model: "gpt-5.5",
        permission_mode: "default",
        stop_hook_active: false,
        last_assistant_message: "Done.",
      }),
    );
    expect(r.status).toBe(0); // Codex ignores stdout on exit 2, which would lose the line Devesh reads
    const out = JSON.parse(r.stdout) as HookOutput;
    expect(Object.keys(out).sort()).toEqual([
      "decision",
      "reason",
      "systemMessage",
    ]); // Codex rejects any field outside its Stop output schema
    expect(out.decision).toBe("block");
    expect(out.reason).toContain(
      "services/worker/src/a.ts:1 switches the type checker off",
    );
    expect(out.systemMessage).toContain(
      "Done gate ✗ sent the agent back (1/5)",
    );
  });

  it("sends a teammate back by exit 2, the only way TeammateIdle blocks", () => {
    const dir = repo();
    write(dir, "services/worker/src/a.ts", "// @ts-ignore\n");
    const r = hook(dir, "TeammateIdle");
    expect(r.status).toBe(2);
    expect(r.reason).toContain("switches the type checker off");
    expect(r.told).toContain("Done gate ✗ sent the agent back (1/5)");
  });

  /** Runs a hook exactly as Codex does: the command from .codex/hooks.json, `$SHELL -lc`, from a subfolder. */
  const codex = (
    dir: string,
    event: string,
    extra: Record<string, unknown> = {},
  ) => {
    const { hooks } = JSON.parse(
      readFileSync(join(import.meta.dir, "..", ".codex", "hooks.json"), "utf8"),
    ) as { hooks: Record<string, { hooks: { command: string }[] }[]> };
    // The gate's own hook: other hooks (the plan reminder's) may share the event.
    const command = (hooks[event] ?? [])
      .flatMap((g) => g.hooks)
      .find((h) => h.command.includes("done-gate"))?.command;
    const r = spawnSync(
      process.env.SHELL || "/bin/sh",
      ["-lc", command ?? "exit 9"],
      {
        cwd: join(dir, "services"), // Codex may be started in a subfolder
        input: JSON.stringify({
          session_id: "codex-thread",
          turn_id: "turn-1",
          transcript_path: null,
          cwd: join(dir, "services"),
          hook_event_name: event,
          model: "gpt-5.5",
          permission_mode: "default",
          source: "startup",
          stop_hook_active: false,
          last_assistant_message: "Done.",
          ...extra,
        }),
        encoding: "utf8",
      },
    );
    return { status: r.status, stdout: r.stdout };
  };

  it("runs from .codex/hooks.json as Codex runs a hook: $SHELL -lc, from the session's folder, input on stdin", () => {
    const dir = repo();
    write(dir, "services/worker/src/a.ts", "const a = 1;\n");
    commitAll(dir); // work from before this session
    expect(codex(dir, "SessionStart")).toEqual({ status: 0, stdout: "" });
    expect(codex(dir, "Stop")).toEqual({ status: 0, stdout: "" }); // nothing changed this session
    write(dir, "services/worker/src/a.ts", "// @ts-ignore\n");
    const r = codex(dir, "Stop");
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({
      decision: "block",
      reason: expect.stringContaining("switches the type checker off"),
    });
  });

  it("never asks Codex for the verifier it doesn't have: a green product change stops once, marked NOT independently verified", () => {
    const dir = repo();
    write(dir, "services/worker/src/a.ts", "const a = 1;\n");
    commitAll(dir);
    expect(codex(dir, "SessionStart").status).toBe(0);
    write(dir, "services/worker/src/a.ts", "const a = 2;\n");
    checksPassed(dir);
    const r = codex(dir, "Stop");
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({
      systemMessage:
        "Done gate ⚠ checks green (typecheck, 3 tests), NOT independently verified (Codex has no verifier agent): ask Claude to run the verifier, or check it yourself",
    });
    expect(codex(dir, "Stop")).toEqual({ status: 0, stdout: "" }); // told once
  });

  it("notes the checkout a Codex command names, so its change there is judged at a Codex stop", () => {
    const dir = repo();
    write(dir, "services/README.md", "the worker\n");
    commitOld(dir);
    const wt = worktree(dir, "feat/codex");
    expect(codex(dir, "SessionStart").status).toBe(0);
    expect(
      codex(dir, "PreToolUse", {
        tool_name: "Bash",
        tool_input: { command: `cd ${wt} && bun test` },
      }),
    ).toEqual({ status: 0, stdout: "" }); // a note, never a say in the tool call
    write(wt, "services/worker/src/a.ts", "// @ts-ignore\n");
    expect(JSON.parse(codex(dir, "Stop").stdout)).toMatchObject({
      decision: "block",
      reason: expect.stringContaining("switches the type checker off"),
    });
  });

  it("is wired in both apps: a note before each command or edit, a judgement at each stop", () => {
    const wired = (file: string) => {
      const { hooks } = JSON.parse(
        readFileSync(join(import.meta.dir, "..", file), "utf8"),
      ) as {
        hooks: Record<
          string,
          { matcher?: string; hooks: { command: string }[] }[]
        >;
      };
      return Object.fromEntries(
        Object.entries(hooks).map(([event, groups]) => [
          event,
          groups
            .filter((g) => g.hooks.some((h) => h.command.includes("done-gate")))
            .map((g) => g.matcher ?? ""),
        ]),
      );
    };
    expect(wired(".claude/settings.json")).toMatchObject({
      SessionStart: [""],
      PreToolUse: ["Bash|Monitor|Edit|Write|MultiEdit|NotebookEdit"],
      Stop: [""],
      TeammateIdle: [""],
      SubagentStart: ["verifier"],
      SubagentStop: ["verifier"],
    });
    expect(wired(".codex/hooks.json")).toMatchObject({
      SessionStart: [""],
      PreToolUse: ["^(Bash|apply_patch)$"],
      Stop: [""],
    });
  });

  it("warns at every one of its hooks, instead of going quiet, in a checkout without the gate", () => {
    const bare = mkdtempSync(join(tmpdir(), "done-gate-none-"));
    dirs.push(bare);
    sh(bare, ["git", "init", "-q"]);
    const commands = [".claude/settings.json", ".codex/hooks.json"].flatMap(
      (file) =>
        Object.values(
          (
            JSON.parse(
              readFileSync(join(import.meta.dir, "..", file), "utf8"),
            ) as { hooks: Record<string, { hooks: { command: string }[] }[]> }
          ).hooks,
        )
          .flat()
          .flatMap((g) => g.hooks.map((h) => h.command))
          .filter((c) => c.includes("done-gate")),
    );
    expect(commands).toHaveLength(9); // six Claude Code events, three Codex ones
    for (const command of commands) {
      const r = sh(bare, ["/bin/sh", "-c", command], {
        CLAUDE_PROJECT_DIR: bare,
      });
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({
        systemMessage:
          "Done gate ⚠ NOT running in this checkout (scripts/done-gate.ts is missing): nothing done here is checked",
      });
    }
  });

  it("refuses a merge and says nothing is checked, never going quiet, when a file of the gate fails to load", () => {
    const dir = repo();
    const words = join(dir, "scripts", "done-gate", "shell-words.ts");
    writeFileSync(
      words,
      readFileSync(words, "utf8").replace(
        "export function simpleCommands(",
        "export function simpleCommandz(",
      ),
    );
    // The checkout's own copy, as a session started there runs it.
    const own = (event: string, command?: string) =>
      sh(
        dir,
        ["bun", "scripts/done-gate.ts", "hook"],
        {},
        JSON.stringify({
          hook_event_name: event,
          session_id: "s1",
          cwd: dir,
          ...(command ? { tool_name: "Bash", tool_input: { command } } : {}),
        }),
      );
    const merge = own("PreToolUse", "gh pr merge 5 --squash");
    expect(merge.status).toBe(0);
    expect(JSON.parse(merge.stdout)).toMatchObject({
      hookSpecificOutput: {
        permissionDecision: "deny",
        permissionDecisionReason: expect.stringContaining(
          "it could not load the done gate (SyntaxError: Export named 'simpleCommands' not found",
        ),
      },
    });
    expect(JSON.parse(own("PreToolUse", "ls").stdout)).toEqual({
      systemMessage: expect.stringContaining(
        "Done gate ⚠ could not load (SyntaxError: Export named 'simpleCommands' not found",
      ),
    });
    for (const event of ["Stop", "SessionStart"])
      expect(JSON.parse(own(event).stdout).systemMessage).toMatch(
        /^Done gate ⚠ could not run \(SyntaxError: .*\); this stop was NOT checked$/,
      );
    rmSync(join(dir, "scripts", "done-gate"), { recursive: true });
    expect(JSON.parse(own("Stop").stdout).systemMessage).toContain(
      "Done gate ⚠ could not run (",
    );
  });

  it("lets a CANNOT_VERIFY ruling stop, told to Devesh as NOT verified with what the verifier needs from him", () => {
    const dir = repo();
    write(dir, "services/worker/src/route.ts", "const route = 1;\n");
    checksPassed(dir);
    hook(dir, "SubagentStart", { agent_type: "verifier" });
    gate(dir, "verdict", "cannot-verify", "a real WhatsApp number to text");
    hook(dir, "SubagentStop", { agent_type: "verifier" });
    expect(hook(dir, "Stop")).toEqual({
      ...QUIET,
      told: "Done gate ⚠ NOT verified: the verifier needs something only you can provide: a real WhatsApp number to text (checks green: typecheck, 3 tests)",
    });
  });

  /** A stand-in for GitHub's CLI whose `gh pr view` names this head commit. */
  const fakeGh = (head: string) => {
    const bin = mkdtempSync(join(tmpdir(), "done-gate-gh-"));
    dirs.push(bin);
    writeFileSync(join(bin, "gh"), `#!/bin/sh\necho ${head}\n`, {
      mode: 0o755,
    });
    return { PATH: `${bin}:${process.env.PATH}` };
  };

  it("refuses an agent's merge until the pull request's head commit passed the gate and, for product code, the verifier", () => {
    const dir = repo();
    sh(dir, ["git", "update-ref", "refs/remotes/origin/main", "HEAD"]);
    sh(dir, ["git", "checkout", "-qb", "feat/sms"]);
    write(dir, "services/worker/src/sms.ts", "const sms = 1;\n");
    commitAll(dir);
    const head = sh(dir, ["git", "rev-parse", "HEAD"]).stdout.trim();
    const short = head.slice(0, 7);
    const merge = (
      command = "gh pr merge 7 --squash --delete-branch",
      codex = false,
      pr = head,
      session = "s1",
    ) => {
      const r = sh(
        dir,
        ["bun", GATE, "hook", ...(codex ? ["codex"] : [])],
        fakeGh(pr),
        JSON.stringify({
          hook_event_name: "PreToolUse",
          session_id: session,
          cwd: dir,
          tool_name: "Bash",
          tool_input: { command },
        }),
      );
      const out = r.stdout ? JSON.parse(r.stdout) : {};
      return {
        refused: out.hookSpecificOutput?.permissionDecision === "deny",
        why: out.hookSpecificOutput?.permissionDecisionReason ?? "",
        told: out.systemMessage ?? "",
      };
    };
    sh(dir, ["git", "checkout", "-q", "main"]); // pushed and back on main: no change left to stop on
    const unchecked = merge();
    expect(unchecked.refused).toBe(true);
    expect(unchecked.why).toContain(
      `${short} has not passed \`bun run gate\` on this machine`,
    );
    expect(unchecked.told).toStartWith("Done gate ✗ merge refused: ");

    sh(dir, ["git", "checkout", "-q", "feat/sms"]);
    checksPassed(dir);
    expect(merge().why).toContain(`nobody independent has seen ${short} work`);
    expect(merge(undefined, true).why).toContain("Codex has no verifier agent");
    expect(verified(dir, dir, "sent a test SMS and saw it logged").status).toBe(
      0,
    );
    expect(merge()).toEqual({
      refused: false,
      why: "",
      told: `Done gate ✓ merge of ${short}: typecheck, 3 tests · verifier PASS: sent a test SMS and saw it logged`,
    });
    expect(merge("git push && gh pr merge 7 --squash").refused).toBe(true);
    for (const quiet of [
      "gh pr list",
      'grep -n "gh pr merge" scripts/done-gate.ts',
      'git commit -qm "an agent gh pr merge is refused until proven"',
      "gh pr merge 7 --disable-auto",
      "gh pr merge --help",
      "gh pr merge 7 -R someone/else --squash", // another repository's
    ])
      expect(merge(quiet)).toEqual({ refused: false, why: "", told: "" });
    expect(merge("gh pr merge --squash").why).toContain(
      "name the pull request by its number",
    );
    expect(
      merge("gh pr merge 7 --squash && gh pr merge 9 --squash").why,
    ).toContain("one pull request at a time");
    expect(merge("gh pr merge 7 --auto --squash").why).toContain(
      `--match-head-commit ${head}`,
    );
    expect(
      merge(`gh pr merge 7 --auto --squash --match-head-commit ${head}`)
        .refused,
    ).toBe(false);
    expect(merge("gh api -X PUT repos/o/r/pulls/7/merge").refused).toBe(true);
    mkdirSync(join(dir, "scratch-lib"));
    sh(join(dir, "scratch-lib"), ["git", "init", "-q"]); // a folder the gate can't snapshot
    sh(dir, ["git", "checkout", "-q", "main"]);
    write(dir, "services/worker/src/sms.ts", "const sms = 2;\n"); // unproven again
    commitAll(dir);
    const unproven = sh(dir, ["git", "rev-parse", "HEAD"]).stdout.trim();
    const fresh = merge(undefined, false, unproven, "s2"); // s2's first note of this checkout fails
    expect(fresh.refused).toBe(true);
    expect(fresh.why).toContain(`${unproven.slice(0, 7)} has not passed`);
    expect(
      readdirSync(join(dir, ".git", "done-gate", "seen")).some((k) =>
        k.startsWith("s2-"),
      ),
    ).toBe(false);
  });

  it("refuses a merge the verifier could not verify: only Devesh merges it", () => {
    const dir = repo();
    sh(dir, ["git", "update-ref", "refs/remotes/origin/main", "HEAD"]);
    write(dir, "services/worker/src/wa.ts", "const wa = 1;\n");
    commitAll(dir);
    checksPassed(dir);
    hook(dir, "SubagentStart", { agent_type: "verifier" });
    gate(dir, "verdict", "cannot-verify", "a real WhatsApp number to text");
    hook(dir, "SubagentStop", { agent_type: "verifier" });
    const head = sh(dir, ["git", "rev-parse", "HEAD"]).stdout.trim();
    const r = hook(
      dir,
      "PreToolUse",
      { tool_name: "Bash", tool_input: { command: "gh pr merge 7 --squash" } },
      fakeGh(head),
    );
    expect(r.told).toBe(
      "Done gate ✗ merge refused: the verifier could not verify " +
        `${head.slice(0, 7)} without something only Devesh can provide (a real WhatsApp number to text), so only Devesh merges it.`,
    );
  });

  it("does not judge a session that only switched to someone else's branch or visited another checkout", () => {
    const dir = repo();
    sh(dir, ["git", "checkout", "-qb", "feat/other"]);
    write(dir, "services/worker/src/other.ts", "const other = 1;\n");
    commitOld(dir);
    sh(dir, ["git", "checkout", "-q", "main"]);
    const wt = worktree(dir, "feat/theirs");
    write(wt, "services/worker/src/theirs.ts", "const theirs = 1;\n"); // their work in progress
    write(dir, ".agents/notes.md", "Devesh's own files, never committed\n");
    hook(dir, "SessionStart");
    sh(dir, ["git", "checkout", "-q", "feat/other"]); // gh pr checkout, to read it
    expect(hook(dir, "Stop")).toEqual(QUIET);
    hook(dir, "PreToolUse", {
      tool_name: "Bash",
      tool_input: { command: `cd ${wt} && git diff` },
    });
    expect(hook(wt, "Stop").sentBack).toBe(false);
    expect(hook(dir, "Stop")).toEqual(QUIET);
  });

  it("does not judge a pull that brings in a teammate's work merged during the session", () => {
    const dir = repo();
    sh(dir, ["git", "update-ref", "refs/remotes/origin/main", "HEAD"]);
    hook(dir, "SessionStart");
    const theirs = worktree(dir, "teammate"); // somebody else's checkout
    write(theirs, "services/worker/src/theirs.ts", "const theirs = 1;\n");
    commitAll(theirs); // merged on GitHub while this session ran
    sh(dir, ["git", "update-ref", "refs/remotes/origin/main", "teammate"]);
    sh(dir, ["git", "merge", "-q", "--ff-only", "origin/main"]); // the session pulls main
    sh(dir, ["git", "checkout", "-qb", "feat/next"]); // and branches off it (AGENTS.md → The loop, step 2)
    expect(hook(dir, "Stop")).toEqual(QUIET);
  });

  it("judges what the session changed in another checkout, wherever its shell ends", () => {
    const dir = repo();
    const wt = worktree(dir, "feat/pay");
    hook(dir, "SessionStart");
    hook(dir, "PreToolUse", {
      // an edit by path, the shell still in the main checkout
      tool_name: "Edit",
      tool_input: { file_path: join(wt, "services/worker/src/pay.ts") },
    });
    write(wt, "services/worker/src/pay.ts", "// @ts-ignore\nconst pay = 1;\n");
    const r = hook(dir, "Stop");
    expect(r.sentBack).toBe(true);
    expect(r.reason).toContain(
      "services/worker/src/pay.ts:1 switches the type checker off",
    );
    expect(r.reason).toStartWith(`In ${relative(realpathSync(dir), wt)}: `);

    const outside = mkdtempSync(join(tmpdir(), "done-gate-none-")); // or a shell left outside the repo
    dirs.push(outside);
    const away = sh(
      outside,
      ["bun", join(dir, "scripts", "done-gate.ts"), "hook"],
      {},
      JSON.stringify({
        hook_event_name: "Stop",
        session_id: "s1",
        cwd: outside,
      }),
    );
    expect(JSON.parse(away.stdout).decision).toBe("block");
    gate(dir, "pause", "Which payment provider?"); // asked from where the shell is
    expect(hook(dir, "Stop").told).toBe(
      "Done gate ⏸ waiting on you: Which payment provider? (the change so far is NOT verified)",
    );

    write(wt, "services/worker/src/pay.ts", "const pay = 1;\n");
    checksPassed(wt);
    expect(verified(wt, dir, "a test payment went through").status).toBe(0); // ruled from the worktree
    expect(hook(dir, "Stop").told).toContain(
      "verifier PASS: a test payment went through",
    );
  });

  it("leaves a checkout to the session that worked there last: a reviewer is not answerable for the builder", () => {
    const dir = repo();
    const wt = worktree(dir, "feat/b");
    hook(dir, "SessionStart"); // the reviewer
    hook(dir, "PreToolUse", {
      tool_name: "Bash",
      tool_input: { command: `git -C ${wt} diff main` },
    });
    hook(wt, "PreToolUse", {
      session_id: "builder",
      tool_name: "Edit",
      tool_input: { file_path: join(wt, "services/worker/src/b.ts") },
    });
    write(wt, "services/worker/src/b.ts", "// @ts-ignore\n");
    expect(hook(dir, "Stop")).toEqual(QUIET);
    expect(hook(wt, "Stop", { session_id: "builder" }).sentBack).toBe(true);
  });

  it("does not count a builder's fresh commit as the session's when the session only switched to it", () => {
    const dir = repo();
    const review = worktree(dir, "review");
    const b = worktree(dir, "feat/b");
    hook(review, "SessionStart"); // the reviewer's own worktree
    write(b, "services/worker/src/b.ts", "const b = 1;\n");
    commitAll(b); // the builder commits during the review
    const pr = sh(b, ["git", "rev-parse", "HEAD"]).stdout.trim();
    sh(review, ["git", "checkout", "-q", "--detach", pr]); // to read and try it
    expect(hook(review, "Stop")).toEqual(QUIET);
  });

  it("treats a worktree removed and added again at the same path as a new checkout", () => {
    const dir = repo();
    const b = worktree(dir, "feat/b");
    write(b, "services/worker/src/b.ts", "const b = 1;\n");
    commitAll(b);
    hook(dir, "SessionStart");
    const check = join(
      realpathSync(dirname(b)),
      `done-gate-check-${Date.now()}`,
    );
    dirs.push(check);
    sh(dir, ["git", "worktree", "add", "-q", "--detach", check, "main"]);
    hook(dir, "PreToolUse", {
      tool_name: "Bash",
      tool_input: { command: `cd ${check} && git log` },
    });
    sh(dir, ["git", "worktree", "remove", check]);
    sh(dir, ["git", "worktree", "add", "-q", "--detach", check, "feat/b"]); // someone else's PR, same path
    expect(hook(dir, "Stop")).toEqual(QUIET);
  });

  it("keeps each verifier's ruling apart when two run at once", () => {
    const dir = repo();
    const b = worktree(dir, "feat/b");
    for (const [root, file] of [
      [dir, "services/worker/src/a.ts"],
      [b, "services/worker/src/b.ts"],
    ] as const) {
      hook(dir, "PreToolUse", {
        tool_name: "Edit",
        tool_input: { file_path: join(root, file) },
      });
      write(root, file, "const x = 1;\n");
      checksPassed(root);
    }
    hook(dir, "SubagentStart", { agent_type: "verifier", agent_id: "v1" });
    hook(dir, "SubagentStart", { agent_type: "verifier", agent_id: "v2" });
    gate(dir, "verdict", "pass", "a works");
    expect(
      hook(dir, "SubagentStop", { agent_type: "verifier", agent_id: "v1" })
        .status,
    ).toBe(0);
    gate(b, "verdict", "pass", "b works");
    expect(
      hook(dir, "SubagentStop", { agent_type: "verifier", agent_id: "v2" })
        .status,
    ).toBe(0);
    expect(hook(dir, "Stop").sentBack).toBe(false);
  });

  it("still judges the session's checkouts when its shell ends in a checkout without the gate", () => {
    const dir = repo();
    const old = worktree(dir, "old"); // a branch cut before the gate existed
    rmSync(join(old, "scripts"), { recursive: true });
    commitOld(old);
    hook(dir, "SessionStart");
    hook(dir, "PreToolUse", {
      tool_name: "Edit",
      tool_input: { file_path: join(dir, "services/worker/src/a.ts") },
    });
    write(dir, "services/worker/src/a.ts", "// @ts-ignore\n");
    const r = sh(
      // as Claude Code runs it: the project's gate, the shell in the old checkout
      old,
      ["bun", join(dir, "scripts", "done-gate.ts"), "hook"],
      {},
      JSON.stringify({ hook_event_name: "Stop", session_id: "s1", cwd: old }),
    );
    expect(JSON.parse(r.stdout).decision).toBe("block");
  });

  it("counts a ruling only for code of the session whose verifier gave it, and a FAIL stands", () => {
    const dir = repo();
    const wt = worktree(dir, "feat/b");
    const edit = (root: string, file: string, session = "s1") =>
      hook(root, "PreToolUse", {
        session_id: session,
        tool_name: "Edit",
        tool_input: { file_path: join(root, file) },
      });
    edit(dir, "services/worker/src/a.ts");
    write(dir, "services/worker/src/a.ts", "const a = 1;\n");
    checksPassed(dir);
    edit(wt, "services/worker/src/b.ts", "b");
    write(wt, "services/worker/src/b.ts", "const b = 1;\n");
    checksPassed(wt);
    hook(dir, "SubagentStart", { agent_type: "verifier" }); // s1's verifier starts
    gate(wt, "verdict", "pass", "looks fine to me"); // meanwhile the other builder grades itself
    gate(dir, "verdict", "fail", "the job never ran");
    gate(dir, "verdict", "pass", "fine"); // a PASS after it on the same code
    expect(hook(dir, "SubagentStop", { agent_type: "verifier" }).status).toBe(
      0,
    );
    expect(hook(wt, "Stop", { session_id: "b" }).sentBack).toBe(true);
    expect(hook(dir, "Stop").reason).toContain(
      "the verifier ruled FAIL: the job never ran",
    );
  });

  it("tells Devesh once when a session changed nothing but its checkout holds unverified product work from before", () => {
    const dir = repo();
    sh(dir, ["git", "update-ref", "refs/remotes/origin/main", "HEAD"]);
    sh(dir, ["git", "checkout", "-qb", "feat/half"]);
    write(dir, "services/worker/src/half.ts", "const half = 1;\n");
    commitOld(dir);
    hook(dir, "SessionStart");
    expect(hook(dir, "Stop")).toEqual({
      ...QUIET,
      told: "Done gate ⚠ this session changed nothing in the main checkout, but it holds product changes from before the session that nobody has verified",
    });
    expect(hook(dir, "Stop")).toEqual(QUIET);
  });

  it("accepts the code it gave up on once the verifier passes it, and still delivers a question", () => {
    const dir = repo();
    write(dir, "services/worker/src/a.ts", "const a = 1;\n");
    checksPassed(dir);
    for (let i = 1; i <= 5; i++) expect(hook(dir, "Stop").sentBack).toBe(true);
    expect(hook(dir, "Stop").told).toContain(
      "NOT DONE: the agent stopped after 5 tries",
    );
    gate(dir, "pause", "Should the retry wait an hour?");
    expect(hook(dir, "Stop").told).toBe(
      "Done gate ⏸ waiting on you: Should the retry wait an hour? (the change so far is NOT verified)",
    );
    expect(verified(dir, dir, "the job ran and wrote its row").status).toBe(0);
    expect(hook(dir, "Stop")).toEqual({
      ...QUIET,
      told: "Done gate ✓ typecheck, 3 tests · verifier PASS: the job ran and wrote its row",
    });
  });

  it("gives up after five tries, tells Devesh it is NOT DONE, and does not nag on unchanged code", () => {
    const dir = repo();
    write(dir, "services/worker/src/a.ts", "// @ts-ignore\n");
    for (let i = 1; i <= 5; i++) expect(hook(dir, "Stop").sentBack).toBe(true);
    const last = hook(dir, "Stop");
    expect(last.sentBack).toBe(false);
    expect(last.told).toContain(
      "Done gate ✗ NOT DONE: the agent stopped after 5 tries",
    );
    expect(hook(dir, "Stop").told).toBe(
      "Done gate ✗ still NOT DONE (unchanged since the agent gave up)",
    );
  });
});

describe("bun run gate rules (CI runs it on every pull request)", () => {
  const rules = (dir: string, ...args: string[]) => {
    const r = sh(dir, ["bun", "scripts/done-gate.ts", "rules", ...args]);
    return { status: r.status, out: r.stdout + r.stderr };
  };

  it("judges the branch's whole change, committed or not, from where it left the base, and nothing the base did since", () => {
    const dir = repo();
    sh(dir, ["git", "branch", "feat"]);
    write(dir, "services/worker/src/on-main.ts", "// @ts-ignore\n");
    commitAll(dir); // main moved on after the branch left it
    sh(dir, ["git", "checkout", "-q", "feat"]);
    write(dir, "services/worker/src/a.ts", "// @ts-ignore\n");
    commitAll(dir);
    write(dir, "services/worker/test/b.test.ts", 'it.only("x", () => {});\n');
    write(dir, ".codex/hooks.json", "{}\n");
    const r = rules(dir, "--base", "main");
    expect(r.status).toBe(1);
    expect(r.out).toContain(
      "Done rules ✗ 2 problem(s) in the change since main:\n- services/worker/src/a.ts:1 switches the type checker off",
    );
    expect(r.out).toContain(
      "- services/worker/test/b.test.ts:1 skips or singles out a test",
    );
    expect(r.out).not.toContain("on-main.ts");
    expect(r.out).toContain('⚠ changed what "done" means: .codex/hooks.json');
  });

  it("passes a clean product change against origin/main by default, without any check or the verifier", () => {
    const dir = repo();
    sh(dir, ["git", "update-ref", "refs/remotes/origin/main", "main"]);
    write(dir, "services/worker/src/route.ts", "const route = 1;\n");
    expect(rules(dir)).toEqual({
      status: 0,
      out: "Done rules ✓ nothing in the change since origin/main breaks them\n",
    });
    expect(existsSync(join(dir, ".git", "done-gate", "checked"))).toBe(false);
  });

  it("finds the importers of a package's default export by the package's name", () => {
    const dir = repo();
    sh(dir, ["git", "update-ref", "refs/remotes/origin/main", "main"]);
    write(
      dir,
      "packages/shared/src/index.ts",
      "export default function describeOrg() {\n  return 1;\n}\n",
    );
    write(
      dir,
      "apps/console/src/lib/api.ts",
      'import describeOrg from "@revenue-os/shared";\nconsole.info(describeOrg());\n',
    );
    expect(rules(dir).status).toBe(0);
    write(dir, "apps/console/src/lib/api.ts", "console.info(1);\n");
    expect(rules(dir).out).toContain(
      "packages/shared/src/index.ts:1 exports a default",
    );
  });

  it("flags exports with common names that nothing imports, however often the word appears elsewhere", () => {
    const dir = repo();
    write(
      dir,
      "services/worker/src/old.ts",
      'import { handler } from "./elsewhere";\nconst x = 1;\nconst config = { x };\nhandler(config);\n',
    );
    commitAll(dir);
    sh(dir, ["git", "update-ref", "refs/remotes/origin/main", "main"]);
    write(
      dir,
      "services/worker/src/new.ts",
      "export const x = 1;\nexport const config = {};\nexport function handler() {}\n",
    );
    write(
      dir,
      "services/worker/src/use.ts",
      'import { config } from "./new";\nconsole.log(config);\n',
    );
    const r = rules(dir);
    expect(r.status).toBe(1);
    expect(r.out).toContain("2 problem(s)");
    expect(r.out).toContain("services/worker/src/new.ts:1 exports x,");
    expect(r.out).toContain("services/worker/src/new.ts:3 exports handler,");
  });

  it("passes exports that are really used: by a dynamic import, in a ternary, after a string holding /*, through a barrel, in a namespace passed whole", () => {
    const dir = repo();
    sh(dir, ["git", "update-ref", "refs/remotes/origin/main", "main"]);
    const src = "services/worker/src";
    write(
      dir,
      `${src}/probe/late.ts`,
      "export async function warmCache() {}\n",
    );
    write(
      dir,
      `${src}/boot.ts`,
      'const { warmCache } = await import("./probe/late");\nawait warmCache();\n',
    );
    write(
      dir,
      `${src}/limits.ts`,
      "export const MAX_ROWS = 500;\nexport const cap = (wanted: number) => (wanted > 500 ? MAX_ROWS : wanted);\n",
    );
    write(
      dir,
      `${src}/upload.ts`,
      'export const ACCEPT = "image/*";\nexport const UPLOAD_LIMIT = 5;\nexport const tooBig = (size: number) => size > UPLOAD_LIMIT;\n/** doc */\n',
    );
    write(dir, `${src}/probe/early.ts`, "export const early = 1;\n");
    write(dir, `${src}/lib.ts`, 'export * from "./probe/early";\n');
    write(dir, `${src}/jobs.ts`, "export const nightly = 1;\n");
    write(
      dir,
      `${src}/main.ts`,
      'import { cap } from "./limits";\nimport { ACCEPT, tooBig } from "./upload";\nimport { early } from "./lib";\nimport * as jobs from "./jobs";\nregister(jobs, cap, ACCEPT, tooBig, early);\n',
    );
    expect(rules(dir)).toEqual({
      status: 0,
      out: "Done rules ✓ nothing in the change since origin/main breaks them\n",
    });
  });

  it("flags a namespace member nothing uses, and passes one used in JSX text with apostrophes", () => {
    const dir = repo();
    sh(dir, ["git", "update-ref", "refs/remotes/origin/main", "main"]);
    const fn = "services/worker/src/fn";
    write(
      dir,
      `${fn}/tools.ts`,
      "export const lookUp = 1;\nexport const orphanTool = 2;\n",
    );
    write(
      dir,
      `${fn}/agent.ts`,
      'import * as tools from "./tools";\nexport const agent = { name: "a", tools: [tools.lookUp] };\n',
    );
    write(
      dir,
      `${fn}/jobs.ts`,
      "export const nightly = 1;\nexport const hourly = 2;\n",
    );
    write(
      dir,
      `${fn}/usejobs.ts`,
      'import * as jobs from "./jobs";\nimport { agent } from "./agent";\nconst { nightly } = jobs;\nrun(nightly, agent);\n',
    );
    const probe = "apps/console/src/probe";
    write(
      dir,
      `${probe}/fmt.ts`,
      "export function money(n: number) {\n  return String(n);\n}\n",
    );
    write(
      dir,
      `${probe}/Total.tsx`,
      "import * as fmt from \"./fmt\";\nexport const Total = ({ n }: { n: number }) => (\n  <p>Don't wait: {fmt.money(n)} is what it's worth</p>\n);\n",
    );
    write(
      dir,
      "apps/console/src/App.tsx",
      'import { Total } from "./probe/Total";\nrender(<Total n={1} />);\n',
    );
    const r = rules(dir);
    expect(r.out).toContain("2 problem(s)");
    expect(r.out).toContain(`${fn}/tools.ts:2 exports orphanTool,`);
    expect(r.out).toContain(`${fn}/jobs.ts:2 exports hourly,`);
    expect(r.status).toBe(1);
  });

  it("sees an edit git's stat cache would miss: same size, in the same second as git last wrote its index", () => {
    const dir = repo();
    sh(dir, ["git", "config", "core.trustctime", "false"]); // only size and modified time decide, whatever the clock does
    const a = join(dir, "services/worker/src/a.ts");
    const second = new Date("2026-01-01T00:00:00Z");
    write(dir, "services/worker/src/a.ts", "const a = 1;\n");
    utimesSync(a, second, second);
    commitAll(dir);
    sh(dir, ["git", "update-ref", "refs/remotes/origin/main", "main"]);
    write(dir, "services/worker/src/a.ts", "// @ts-ignore"); // 13 bytes, like the line it replaces
    utimesSync(a, second, second);
    utimesSync(join(dir, ".git", "index"), second, second); // git knows to re-read a.ts: `git status` sees the edit
    expect(
      sh(dir, ["git", "--no-optional-locks", "status", "--porcelain"]).stdout,
    ).toContain("a.ts"); // read-only: a plain `git status` rewrites the index
    const r = rules(dir);
    expect(r.out).toContain(
      "services/worker/src/a.ts:1 switches the type checker off",
    );
    expect(r.status).toBe(1);
  });

  it("fails when it can't find the base, rather than judge an empty change", () => {
    const dir = repo();
    write(dir, "services/worker/src/a.ts", "// @ts-ignore\n");
    commitAll(dir);
    for (const args of [[], ["--base", "origin/nope"]]) {
      const r = rules(dir, ...args);
      expect(r.status).toBe(2);
      expect(r.out).toContain("Done rules ✗ could not compare the change with");
      expect(r.out).toContain("git merge-base failed");
    }
    expect(rules(dir, "--base").status).toBe(2); // usage
  });
});

describe("bun run gate tests: every test must really run, however it was switched off", () => {
  const tests = (dir: string, ...args: string[]) => {
    const r = sh(dir, ["bun", "scripts/done-gate.ts", "tests", ...args]);
    return { status: r.status, out: r.stdout + r.stderr };
  };

  it("fails when bun reports a test skipped, todo or singled out through an alias or a destructured skip", () => {
    const dir = repo();
    write(
      dir,
      "services/worker/test/alias.test.ts",
      `import { describe, expect, test as t } from "bun:test";
t("runs", () => expect(1).toBe(1));
t.skip("b", () => {});
const { skip } = describe;
skip("a", () => {
  t("inside a", () => {});
});
const { todo } = t;
todo("c", () => {});
`,
    );
    const r = tests(dir);
    expect(r.out).toContain("1 pass"); // bun's own output still shows
    expect(r.out).toContain(
      "✗ 3 test(s) did not run (skipped or todo):\n- services/worker/test/alias.test.ts > b\n- services/worker/test/alias.test.ts > inside a\n- services/worker/test/alias.test.ts > c\n",
    );
    expect(r.status).toBe(1);

    write(
      dir,
      "services/worker/test/alias.test.ts",
      'import { test } from "bun:test";\nconst { only } = test;\nonly("solo", () => {});\ntest("left out", () => {});\n',
    );
    expect(tests(dir).status).not.toBe(0); // CI=1: bun refuses .only, however it was reached
  });

  it("passes when every test ran, or the only one skipped is listed as allowed, with why", () => {
    const dir = repo();
    write(
      dir,
      "services/worker/test/ok.test.ts",
      'import { test } from "bun:test";\ntest("runs", () => {});\n',
    );
    expect(tests(dir).status).toBe(0);
    write(
      dir,
      "scripts/dev-login.test.ts",
      'import { it } from "bun:test";\nit.skipIf(true)("creates the dev user via /auth/v1/signup with the anon key when absent", () => {});\n',
    );
    const r = tests(dir);
    expect(r.out).not.toContain("did not run");
    expect(r.status).toBe(0);
  });

  it("fails when Playwright reports a browser check skipped, fixme'd through an alias included", () => {
    const dir = repo();
    // A stand-in for `bun run e2e`, on this checkout's Playwright; no test here opens a browser.
    sh(dir, [
      "ln",
      "-s",
      join(import.meta.dir, "..", "node_modules"),
      "node_modules",
    ]);
    write(
      dir,
      "package.json",
      JSON.stringify({ scripts: { e2e: "playwright test -c pw.config.ts" } }),
    );
    write(
      dir,
      "pw.config.ts",
      'export default { testDir: "e2e", testMatch: "**/*.e2e.ts", reporter: "list" };\n',
    );
    write(
      dir,
      "e2e/a.e2e.ts",
      'import { test } from "@playwright/test";\nconst { fixme } = test;\ntest("runs", () => {});\nfixme("later", () => {});\n',
    );
    const r = tests(dir, "e2e");
    expect(r.out).toContain("1 passed"); // Playwright's own output still shows
    expect(r.out).toContain(
      "✗ 1 test(s) did not run (skipped or todo):\n- a.e2e.ts > later\n",
    );
    expect(r.status).toBe(1);
    write(
      dir,
      "e2e/a.e2e.ts",
      'import { test } from "@playwright/test";\ntest("runs", () => {});\n',
    );
    expect(tests(dir, "e2e").status).toBe(0);
  });
});

describe("the shared local stack (one database and port 4173 for every worktree)", () => {
  it("lets one check at a time use it, across every worktree of the repo", async () => {
    const dir = repo();
    const other = join(mkdtempSync(join(tmpdir(), "done-gate-wt-")), "wt");
    dirs.push(dirname(other));
    sh(dir, ["git", "worktree", "add", "-q", "-b", "other", other]);
    const spans: [number, number][] = [];
    const use = (where: string) =>
      onSharedStack(where, async () => {
        const start = performance.now();
        await Bun.sleep(150);
        spans.push([start, performance.now()]);
      });
    await Promise.all([use(dir), use(other), use(dir)]);
    spans.sort((a, b) => a[0] - b[0]);
    expect(spans).toHaveLength(3);
    for (let i = 1; i < spans.length; i++)
      expect(spans[i]?.[0]).toBeGreaterThanOrEqual(spans[i - 1]?.[1] ?? 0);
  });

  it("takes over the lock of a run that died, waits for one still running, and always releases its own", async () => {
    const dir = repo();
    const lock = join(dir, ".git", "done-gate", "local-stack.lock");
    mkdirSync(dirname(lock), { recursive: true });
    writeFileSync(lock, String(spawnSync("true").pid)); // that process has exited
    expect(await onSharedStack(dir, () => "ran")).toBe("ran");
    expect(existsSync(lock)).toBe(false);

    writeFileSync(lock, String(process.pid)); // a holder that is still running
    let ran = false;
    const waiting = onSharedStack(dir, () => {
      ran = true;
    });
    await Bun.sleep(1200);
    expect(ran).toBe(false);
    rmSync(lock);
    await waiting;
    expect(ran).toBe(true);

    await expect(
      onSharedStack(dir, () => {
        throw new Error("the check crashed");
      }),
    ).rejects.toThrow("the check crashed");
    expect(existsSync(lock)).toBe(false);
  });

  it("takes over at once a lock that names no process: empty, not a number, zero or negative", async () => {
    const dir = repo();
    const lock = join(dir, ".git", "done-gate", "local-stack.lock");
    mkdirSync(dirname(lock), { recursive: true });
    for (const junk of ["", "garbage", "0", "-7", "1.5"]) {
      writeFileSync(lock, junk);
      expect(await onSharedStack(dir, () => junk)).toBe(junk);
      expect(existsSync(lock)).toBe(false);
    }
  });

  it("gives up after its wait limit, naming the process that holds the stack", async () => {
    const dir = repo();
    const lock = join(dir, ".git", "done-gate", "local-stack.lock");
    mkdirSync(dirname(lock), { recursive: true });
    writeFileSync(lock, String(process.pid)); // a holder that is still running
    const gaveUp = await onSharedStack(dir, () => "ran", 300).catch(
      (e: Error) => e.message,
    );
    expect(gaveUp).toContain(`held by process ${process.pid}`);
    expect(readFileSync(lock, "utf8")).toBe(String(process.pid)); // left alone
  });

  it("hands a dead run's lock to exactly one of many waiters, every time, even when each holder dies holding it", async () => {
    const dir = repo();
    const lock = join(dir, ".git", "done-gate", "local-stack.lock");
    mkdirSync(dirname(lock), { recursive: true });
    writeFileSync(lock, String(spawnSync("true").pid)); // a run that died holding it
    const go = Date.now() + 1000; // once every process below has started
    write(
      dir,
      "hold.ts",
      `import { appendFileSync, rmSync, writeFileSync } from "node:fs";
import { onSharedStack } from "./scripts/done-gate/shared-stack.ts";
while (Date.now() < ${go});
await onSharedStack(".", async () => {
  try { writeFileSync("holding", "", { flag: "wx" }); } catch { appendFileSync("log", "two holders at once\\n"); }
  await Bun.sleep(20);
  rmSync("holding", { force: true });
  appendFileSync("log", "held\\n");
  process.exit(0); // dies holding the lock, so every handover is a race to take over a stale one
});
`,
    );
    const runs = Array.from({ length: 16 }, () =>
      Bun.spawn([process.execPath, "hold.ts"], { cwd: dir, stderr: "pipe" }),
    );
    const errors = await Promise.all(
      runs.map((p) => new Response(p.stderr).text()),
    );
    expect(errors.join("")).toBe("");
    expect(readFileSync(join(dir, "log"), "utf8")).toBe("held\n".repeat(16));
  }, 30_000);
});
