// What the done rules saw only since Slice 0's done-rules item (ROADMAP.md): a `done-gate: allow` exception with no
// reason, a removed test file, test or expect line, code that only moved (one file split into several), a re-export
// nothing imports through, and product code outside a short list of folders. Pure cases call the rules; the rest run
// the gate as CI (`bun run gate rules`), main's copy (`bun run gate pr`) and a stop do, in throwaway repos holding a
// copy of it.
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
import { dirname, join } from "node:path";
import { usesExport } from "./done-gate/export-users";
import { checkRules, isProduct } from "./done-gate/rules";

const GATE = join(import.meta.dir, "done-gate.ts");
setDefaultTimeout(30_000); // each case starts git and bun several times
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
    encoding: "utf8",
    input,
  });
const write = (dir: string, file: string, body: string) => {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), body);
};
const GIT = ["git", "-c", "user.email=t@t", "-c", "user.name=t"];
/** A commit dated before any session, as main's history is. */
const commit = (dir: string) => {
  sh(dir, ["git", "add", "-A"]);
  sh(dir, [...GIT, "commit", "-qm", "x"], {
    GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
  });
};

/** A scratch repo whose main holds a copy of the gate, a roadmap whose current slice has the item "x", and `files`; branch `feat` is checked out. */
function project(files: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "done-gate-rules-"));
  dirs.push(dir);
  mkdirSync(join(dir, "scripts"));
  copyFileSync(GATE, join(dir, "scripts", "done-gate.ts"));
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
  write(dir, "STATE.md", "# State\n");
  write(
    dir,
    "ROADMAP.md",
    "# Roadmap\n\n## Slice 0: Safe work\nStatus: in progress\nBlocked by: nothing\n\n- [ ] x (agent)\n",
  );
  write(
    dir,
    "docs/fix-when-touched.md",
    "# Fix when touched\n\n## Find your area\n\n| If your PR touches… | Fix this too |\n|---|---|\n| `docs/runbooks/` | 5. Runbooks |\n",
  );
  for (const [file, text] of Object.entries(files)) write(dir, file, text);
  sh(dir, ["git", "init", "-q", "-b", "main"]);
  commit(dir);
  sh(dir, ["git", "checkout", "-qb", "feat"]);
  return dir;
}

/** `bun run gate rules`, as CI runs it on a pull request: the branch's change since it left main. */
const rules = (dir: string) => {
  const r = sh(dir, ["bun", "scripts/done-gate.ts", "rules", "--base", "main"]);
  return { status: r.status, out: r.stdout + r.stderr };
};
/** `bun run gate pr`, as rules-from-main runs it: the branch committed, judged from main's checkout as data. */
const pr = (dir: string, body: string) => {
  sh(dir, ["git", "add", "-A"]);
  sh(dir, [...GIT, "commit", "-qm", "branch"]);
  sh(dir, ["git", "checkout", "-q", "main"]);
  const r = sh(
    dir,
    ["bun", "scripts/done-gate.ts", "pr", "--base", "main", "--head", "feat"],
    { PR_BODY: body, PR_NUMBER: "7" },
  );
  sh(dir, ["git", "checkout", "-q", "feat"]);
  return { status: r.status, out: r.stdout + r.stderr };
};
const FIRST = "Roadmap: Slice 0 — x\n\n";

/** The hook at a stop, run from this checkout as Claude Code runs it; the gate hands over to the repo's own copy. */
const stop = (dir: string) => {
  const r = sh(
    dir,
    ["bun", GATE, "hook"],
    {},
    JSON.stringify({ hook_event_name: "Stop", session_id: "s1", cwd: dir }),
  );
  const out = r.stdout
    ? (JSON.parse(r.stdout) as { reason?: string; systemMessage?: string })
    : {};
  return { told: out.systemMessage ?? "", reason: out.reason ?? r.stderr };
};
/** The checks' result for the code as it stands, recorded as a passing run would; no check runs here. */
const checksPassed = (dir: string) => {
  const index = join(dir, ".git", `test-index-${Date.now()}`);
  sh(dir, ["git", "add", "-A"], { GIT_INDEX_FILE: index });
  const tree = sh(dir, ["git", "write-tree"], {
    GIT_INDEX_FILE: index,
  }).stdout.trim();
  rmSync(index);
  write(dir, `.git/done-gate/checked/${tree}`, "typecheck, 3 tests");
};

const CALLS = "services/worker/test/calls.test.ts";
const CALLS_ON_MAIN = [
  'import { expect, it } from "bun:test";',
  "",
  'it("places a call", () => {',
  '  expect(place()).toBe("queued");',
  "  expect(count()).toBe(1);",
  "});",
  "",
  'it("refuses a blocked number", () => {',
  '  expect(place("+1")).toBe("refused");',
  "});",
  "",
].join("\n");
const ADD_TO_LIST = (target: string) =>
  `to remove it on purpose, add a line to docs/removed-tests.md in this change: \`YYYY-MM-DD · ${target} · <why>\``;

/** Test number n of a big file: ten lines, each its own. */
const block = (n: number) =>
  [
    `it("case ${n} adds up", () => {`,
    `  const a${n} = ${n};`,
    `  const b${n} = a${n} * 2;`,
    `  const c${n} = b${n} + 1;`,
    `  const d${n} = c${n} - a${n};`,
    `  const e${n} = [a${n}, b${n}, c${n}, d${n}];`,
    `  expect(e${n}).toHaveLength(4);`,
    `  expect(d${n}).toBe(${n} + 1);`,
    `  expect(b${n} % 2).toBe(0);`,
    "});",
    "",
  ].join("\n");
const blocks = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => block(from + i)).join("");

describe("a done-gate: allow exception", () => {
  const file = "services/worker/test/vapi.test.ts";
  const judged = (text: string) =>
    checkRules([file], [{ file, line: 3, text }], () => []);

  it("needs a written reason after the marker, on its own line", () => {
    for (const text of [
      'it.skip("replays the webhook", () => {}); // done-gate: allow',
      'it.skip("replays the webhook", () => {}); /* done-gate: allow */',
      'it.skip("replays the webhook", () => {}); // (done-gate: allow)',
      'it.skip("replays the webhook", () => {}); // done-gate: allow — .',
    ])
      expect(judged(text).problems).toEqual([
        `${file}:3 skips or singles out a test; every test must run, and its \`done-gate: allow\` gives no reason: write why after it, on the same line`,
      ]);
    const ok = judged(
      'it.skip("replays the webhook", () => {}); // done-gate: allow Vapi sandbox down (#120)',
    );
    expect(ok.problems).toEqual([]);
    expect(ok.notes).toEqual([
      `exception at ${file}:3 (Vapi sandbox down (#120))`,
    ]);
    expect(ok.exceptions).toEqual([
      { file, line: 3, why: "Vapi sandbox down (#120)" },
    ]);
  });

  it("is shown in CI's log, and the PR body must show it too, in a line GitHub shows", () => {
    const dir = project();
    write(
      dir,
      "services/worker/test/a.test.ts",
      'it.skip("waits on Vapi", () => {}); // done-gate: allow Vapi sandbox down\n',
    );
    const note =
      "⚠ exception at services/worker/test/a.test.ts:1 (Vapi sandbox down)";
    expect(rules(dir)).toEqual({
      status: 0,
      out: `Done rules ✓ nothing in the change since main breaks them\n${note}\n`,
    });
    const line =
      "Exception: services/worker/test/a.test.ts · Vapi sandbox down";
    const refused = pr(dir, FIRST);
    expect(refused.status).toBe(1);
    expect(refused.out).toContain(
      `- the PR body does not show the exception at services/worker/test/a.test.ts:1: add the line \`${line}\``,
    );
    expect(pr(dir, `${FIRST}<!-- ${line} -->\n`).status).toBe(1);
    const shown = pr(dir, `${FIRST}${line}\n`);
    expect(shown.status).toBe(0);
    expect(shown.out).toContain(note);
  });
});

describe("a removed test file, test or expect line", () => {
  it("is a rule problem unless the same change names it in docs/removed-tests.md; an expect edited in place is no removal", () => {
    const dir = project({ [CALLS]: CALLS_ON_MAIN });
    write(
      dir,
      CALLS,
      'import { expect, it } from "bun:test";\n\nit("places a call", () => {\n  expect(place()).toBe("ringing");\n});\n',
    );
    const r = rules(dir);
    expect(r.status).toBe(1);
    expect(r.out).toContain(
      `Done rules ✗ 2 problem(s) in the change since main:\n- ${CALLS} > expect at line 5: the change removes this expect line (its line number before the change); ${ADD_TO_LIST(`${CALLS} > expect at line 5`)}\n- ${CALLS} > refuses a blocked number: the change removes this test; ${ADD_TO_LIST(`${CALLS} > refuses a blocked number`)}\n`,
    );
    const entries = [
      `2026-10-03 · ${CALLS} > expect at line 5 · the count is checked by calls-count.test.ts now`,
      `2026-10-03 · ${CALLS} > refuses a blocked number · blocking is the guard's job, tested there`,
    ];
    write(
      dir,
      "docs/removed-tests.md",
      `# Removed tests\n\n${entries[0]}\n- ${entries[1]}\n`,
    );
    expect(rules(dir)).toEqual({
      status: 0,
      out: `Done rules ✓ nothing in the change since main breaks them\n⚠ removed test: ${entries[0]}\n⚠ removed test: ${entries[1]}\n`,
    });
  });

  it("names a deleted test file once, whole, and leaves a deleted helper with no test alone", () => {
    const dir = project({
      [CALLS]: CALLS_ON_MAIN,
      "services/worker/test/helpers.ts": "export const place = () => 1;\n",
    });
    rmSync(join(dir, CALLS));
    rmSync(join(dir, "services/worker/test/helpers.ts"));
    const r = rules(dir);
    expect(r.out).toContain(
      `Done rules ✗ 1 problem(s) in the change since main:\n- ${CALLS} > whole file: the change deletes this test file; ${ADD_TO_LIST(`${CALLS} > whole file`)}\n`,
    );
    write(
      dir,
      "docs/removed-tests.md",
      `2026-10-03 · ${CALLS} > whole file · calls are tested end to end in calls.e2e.ts now\n`,
    );
    expect(rules(dir).status).toBe(0);
  });

  it("sees a test whose name the formatter put on the next line, and not test code quoted in a string", () => {
    const dir = project({
      [CALLS]: `it(\n  "a name too long for one line",\n  () => {},\n);\nconst sample = 'it("quoted", () => { expect(1).toBe(1); })';\n`,
    });
    write(dir, CALLS, "const kept = 1;\n");
    const r = rules(dir);
    expect(r.out).toContain("1 problem(s)");
    expect(r.out).toContain(`${CALLS} > a name too long for one line:`);
  });

  it("must be copied into the PR body, each line as docs/removed-tests.md has it", () => {
    const dir = project({ [CALLS]: CALLS_ON_MAIN });
    write(
      dir,
      CALLS,
      CALLS_ON_MAIN.replace("  expect(count()).toBe(1);\n", ""),
    );
    const entry = `2026-10-03 · ${CALLS} > expect at line 5 · the count is checked by calls-count.test.ts now`;
    write(dir, "docs/removed-tests.md", `# Removed tests\n\n- ${entry}\n`);
    const refused = pr(dir, FIRST);
    expect(refused.status).toBe(1);
    expect(refused.out).toContain(
      `- the PR body does not copy a line docs/removed-tests.md gains: add \`${entry}\``,
    );
    expect(pr(dir, `${FIRST}\`\`\`\n${entry}\n\`\`\`\n`).status).toBe(1);
    const copied = pr(dir, `${FIRST}Removed tests:\n- ${entry}\n`);
    expect(copied.status).toBe(0);
    expect(copied.out).toContain(`⚠ removed test: ${entry}`);
  });
});

describe("moved code, found by git's moved-code detection", () => {
  const BIG = "services/worker/test/big.test.ts";
  const part = (n: number) => `services/worker/test/big-${n}.test.ts`;
  const split = (dir: string) => {
    rmSync(join(dir, BIG));
    write(dir, part(1), blocks(1, 8));
    write(dir, part(2), blocks(9, 15));
    write(dir, part(3), blocks(16, 23));
    write(dir, part(4), blocks(24, 30));
  };

  it("counts a 300-line test file split into four as moved: nothing removed, and each file's moved lines shown", () => {
    const dir = project({ [BIG]: blocks(1, 30) });
    split(dir);
    expect(rules(dir)).toEqual({
      status: 0,
      out: `Done rules ✓ nothing in the change since main breaks them\n⚠ moved lines: ${part(1)} 80 in, ${part(2)} 70 in, ${part(3)} 80 in, ${part(4)} 70 in, ${BIG} 300 out\n`,
    });
  });

  it("does not count a moved line edited in place as moved", () => {
    const dir = project({ [BIG]: blocks(1, 30) });
    split(dir);
    write(
      dir,
      part(2),
      blocks(9, 15).replace("expect(d9).toBe(9 + 1);", "expect(d9).toBe(10);"),
    );
    const r = rules(dir);
    expect(r.status).toBe(1);
    expect(r.out).toContain(
      `Done rules ✗ 1 problem(s) in the change since main:\n- ${BIG} > expect at line 88: the change removes this expect line`,
    );
    expect(r.out).toContain(
      `⚠ moved lines: ${part(1)} 80 in, ${part(2)} 69 in, ${part(3)} 80 in, ${part(4)} 70 in, ${BIG} 299 out\n`,
    );
  });

  it("counts a test moved out of the test files, into a note, as removed", () => {
    const dir = project({ [CALLS]: CALLS_ON_MAIN });
    rmSync(join(dir, CALLS));
    write(dir, "docs/old-calls.md", CALLS_ON_MAIN);
    const r = rules(dir);
    expect(r.out).toContain(
      `Done rules ✗ 1 problem(s) in the change since main:\n- ${CALLS} > whole file: the change deletes this test file`,
    );
    expect(r.out).toContain(
      `⚠ moved lines: docs/old-calls.md 10 in, ${CALLS} 10 out`,
    );
  });

  it("still checks moved lines for skipped tests, throwing stubs and silenced checks", () => {
    const test = [
      'it.skip("waits on the Vapi sandbox to come back", () => {',
      '  expect(replayWebhook("call-ended")).toBe("stored");',
      "});",
      "",
    ].join("\n");
    const code = [
      "// @ts-ignore the old SDK has no types for this call",
      "export function placeCall(contactId: string) {",
      '  throw new Error("placeCall: not implemented yet, the adapter comes later");',
      "}",
      "",
    ].join("\n");
    const dir = project({
      "services/worker/test/vapi.test.ts": test,
      "services/worker/src/calls.ts": code,
    });
    rmSync(join(dir, "services/worker/test/vapi.test.ts"));
    rmSync(join(dir, "services/worker/src/calls.ts"));
    write(dir, "services/worker/test/vapi-replay.test.ts", test);
    write(dir, "services/worker/src/place-call.ts", code);
    write(
      dir,
      "services/worker/src/main.ts",
      'import { placeCall } from "./place-call";\nplaceCall("c1");\n',
    );
    const r = rules(dir);
    expect(r.out).toContain("3 problem(s)");
    expect(r.out).toContain(
      "- services/worker/test/vapi-replay.test.ts:1 skips or singles out a test",
    );
    expect(r.out).toContain(
      "- services/worker/src/place-call.ts:1 switches the type checker off",
    );
    expect(r.out).toContain(
      "- services/worker/src/place-call.ts:3 adds a placeholder that throws",
    );
    expect(r.out).toContain(
      "⚠ moved lines: services/worker/src/calls.ts 4 out, services/worker/src/place-call.ts 4 in",
    );
  });
});

describe("a re-export", () => {
  const src = "services/worker/src";

  it("is not itself a use of the name it passes on", () => {
    expect(
      usesExport(
        'export { formatInvoice } from "./invoice";\n',
        `${src}/index.ts`,
        `${src}/invoice.ts`,
        "formatInvoice",
      ),
    ).toBe(false);
  });

  it("is checked as an export, and counts as a use only when code outside tests imports the name through it", () => {
    // Through two files that pass it on, neither a folder's index (a folder import counts for its whole folder).
    const dir = project();
    write(dir, `${src}/invoice.ts`, "export function formatInvoice() {}\n");
    write(
      dir,
      `${src}/billing/api.ts`,
      'export { formatInvoice } from "../invoice";\n',
    );
    write(
      dir,
      `${src}/public.ts`,
      'export { formatInvoice } from "./billing/api";\n',
    );
    const r = rules(dir);
    expect(r.status).toBe(1);
    expect(r.out).toContain("3 problem(s)");
    for (const file of ["billing/api.ts", "invoice.ts", "public.ts"])
      expect(r.out).toContain(
        `- ${src}/${file}:1 exports formatInvoice, but nothing outside tests uses it`,
      );
    write(
      dir,
      "services/worker/test/invoice.test.ts",
      'import { formatInvoice } from "../src/public";\nformatInvoice();\n',
    );
    expect(rules(dir).out).toContain("3 problem(s)"); // a test's import is no use
    write(
      dir,
      `${src}/send.ts`,
      'import { formatInvoice } from "./public";\nformatInvoice();\n',
    );
    expect(rules(dir).status).toBe(0);
  });

  it("follows a renamed re-export by its new name", () => {
    const dir = project();
    write(dir, `${src}/invoice.ts`, "export function formatInvoice() {}\n");
    write(
      dir,
      `${src}/api.ts`,
      'export { formatInvoice as invoiceText } from "./invoice";\n',
    );
    const r = rules(dir);
    expect(r.out).toContain("2 problem(s)");
    expect(r.out).toContain(`- ${src}/api.ts:1 exports invoiceText`);
    expect(r.out).toContain(`- ${src}/invoice.ts:1 exports formatInvoice`);
    write(
      dir,
      `${src}/send.ts`,
      'import { invoiceText } from "./api";\ninvoiceText();\n',
    );
    expect(rules(dir).status).toBe(0);
  });

  it("checks `export * from` as an export of every name it passes on, used when code outside tests imports one through it", () => {
    const dir = project();
    write(
      dir,
      `${src}/money.ts`,
      "export const toCents = (n: number) => n * 100;\n",
    );
    write(dir, `${src}/lib.ts`, 'export * from "./money";\n');
    const r = rules(dir);
    expect(r.out).toContain("2 problem(s)");
    expect(r.out).toContain(
      `- ${src}/lib.ts:1 passes on everything ./money exports, but nothing outside tests imports any of it through this file`,
    );
    expect(r.out).toContain(`- ${src}/money.ts:1 exports toCents`);
    write(
      dir,
      `${src}/price.ts`,
      'import { toCents } from "./lib";\ntoCents(1);\n',
    );
    expect(rules(dir).status).toBe(0);
  });
});

describe("product code", () => {
  it("is every changed file except docs/, Markdown, tests, and the gate, CI and hook files", () => {
    for (const file of [
      "services/worker/src/a.ts",
      "scripts/seed.ts",
      "scripts/demo.ts",
      "scripts/guards/pattern-files.ts",
      "scripts/provision-staging.sh",
      "package.json",
      "apps/console/package.json",
      "bun.lock",
      "Dockerfile",
      "services/worker/Dockerfile",
      ".dockerignore",
      "supabase/config.toml",
      "apps/www/index.html",
      "apps/www/public/_headers",
      "packages/harness/demo-harness.ts",
      "biome.json",
    ])
      expect([file, isProduct(file)]).toEqual([file, true]);
    for (const file of [
      "",
      "docs/runbooks/rotate-keys.md",
      "docs/tracker/parse.js",
      "docs/removed-tests.md",
      "README.md",
      "apps/www/NOTES.MD",
      "STATE.md",
      "services/worker/test/a.test.ts",
      "apps/console/e2e/auth.e2e.ts",
      "tests/rls_coverage.sql",
      ".github/workflows/ci.yml",
      ".codex/hooks.json",
      ".claude/settings.json",
      ".claude/agents/verifier.md",
      "scripts/done-gate.ts",
      "scripts/done-gate/rules.ts",
      "scripts/done-gate-verifier-run.ts",
    ])
      expect([file, isProduct(file)]).toEqual([file, false]);
  });

  it("needs the verifier at a stop when package.json changes, and not when only a test and docs change", () => {
    const dir = project({ "package.json": '{ "name": "x" }\n' });
    write(dir, "package.json", '{ "name": "x", "private": true }\n');
    checksPassed(dir);
    expect(stop(dir).reason).toContain(
      'Run the verifier agent (Agent tool, subagent_type "verifier")',
    );
    write(dir, "package.json", '{ "name": "x" }\n');
    write(dir, "docs/notes.md", "hello\n");
    write(dir, "services/worker/test/a.test.ts", "const a = 1;\n");
    checksPassed(dir);
    expect(stop(dir).told).toBe(
      "Done gate ✓ typecheck, 3 tests (no product code changed, so no verifier needed)",
    );
  });
});

describe("a stop", () => {
  it("shows Devesh each exception, each removed-test line and each moved file", () => {
    const dir = project({
      [CALLS]: CALLS_ON_MAIN,
      "services/worker/test/big.test.ts": blocks(1, 4),
    });
    write(
      dir,
      CALLS,
      `it.skip("rings twice", () => {}); // done-gate: allow the carrier sandbox is down\n${CALLS_ON_MAIN.split("\n").slice(0, 6).join("\n")}\n`,
    );
    const entry = `2026-10-03 · ${CALLS} > refuses a blocked number · blocking is the guard's job, tested there`;
    write(dir, "docs/removed-tests.md", `${entry}\n`);
    rmSync(join(dir, "services/worker/test/big.test.ts"));
    write(dir, "services/worker/test/big-1.test.ts", blocks(1, 4));
    checksPassed(dir);
    expect(stop(dir).told).toBe(
      `Done gate ✓ typecheck, 3 tests (no product code changed, so no verifier needed) · ⚠ exception at ${CALLS}:1 (the carrier sandbox is down) · removed test: ${entry} · moved lines: services/worker/test/big-1.test.ts 40 in, services/worker/test/big.test.ts 40 out`,
    );
  });
});
