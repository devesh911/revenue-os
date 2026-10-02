// The done rules: what no added line may do (throw as a placeholder, export what nothing calls, switch off a
// test or a checker, read source code in a test), and which files decide what "done" means.

import { exportsOf, statementAt, uncommented } from "./code-text";
import type { Added } from "./diff";
import type { Snap } from "./snapshot";

const PRODUCT =
  /^(apps|services|packages)\/[^/]+\/src\/|^supabase\/(migrations|seed)/;
const TEST =
  /[._](test|spec)\.[cm]?[jt]sx?$|\.e2e\.[cm]?[jt]sx?$|(^|\/)(tests?|e2e|__tests__)\//;
const CODE = /\.[cm]?[jt]sx?$/;

// A string literal naming source code: a src/ path, or a file ending .ts/.tsx/.js/.jsx.
const SOURCE_PATH =
  /["'`](?:[^"'`\n]*\/)?(?:src(?:\/[^"'`\n]*)?|[^"'`\n]+\.[cm]?[jt]sx?)["'`]/;
// Rule files: the files that decide what "done" means and how agents work, at any letter case. This is the one
// list; AGENTS.md hard rail 7, .github/CODEOWNERS and STATE.md cite it rather than repeating it, and the CODEOWNERS
// test keeps the two equal. Changing one is allowed: Devesh is told at every stop and in CI's log, and its pull
// request explains it and records it (rule-changes.ts). ROADMAP.md and STATE.md stay out, because every pull
// request changes them.
export const RULE_FILES =
  /^(\.github\/|\.codex\/|scripts\/(guards(\.sh$|\/)|done-gate|cycle-hook\.sh$|cycle\.ts$|local-env\.ts$|local-url\.ts$|app-service-login\.ts$)|tests\/(rls_coverage\.sql|setup[^/]*\.ts)$|\.mcp\.json$)|(^|\/)(\.claude\/(settings[^/]*\.json$|agents\/|skills\/|commands\/)|(AGENTS|CLAUDE)\.md$|\.gitleaks(\.toml|ignore)$|\.gitattributes$|package\.json$|bunfig\.toml$|biome\.jsonc?$|tsconfig[^/]*\.json$|playwright\.config\.ts$)/i;
const ALLOW = "done-gate: allow";
// In a test file, a test switched off or singled out: skip/only/todo, their conditional forms (skipIf, runIf,
// todoIf, if), Playwright's fixme and fail, bun's failing, after any modifiers (concurrent, serial, describe),
// called or picked as a value (`cond ? describe : describe.skip`, test["skip"]), and xit/xtest/xdescribe. The
// runner's name is captured, so a line's own variable of that name (`(it) => it.skip`) is left alone. What no
// pattern sees (an alias, a destructured skip) the tests check still catches: see MAY_SKIP.
// In a test, a delete of companies or queued jobs. tests/test-companies.ts does that for every test, deleting only
// what the test made; anything broader (`where slug like 'test-%'`, `where name = 'place_call'`) also deletes the
// companies and jobs of another test run on the shared database, or of the dev login's workspace.
const DELETES_SHARED =
  /\b(?:delete\s+from|truncate(?:\s+table)?)\s+(?:only\s+)?(?:public\.)?(?:orgs|pgboss\.\w+)\b|\bdrop\s+schema\s+(?:if\s+exists\s+)?pgboss\b/i;
const SKIP =
  /(?<![\w$.!])(it|test|describe)(?:\s*\.\s*[\w$]+)*?\s*(?:\.\s*|\[\s*["'`])(?:skip|only|todo|skipIf|runIf|todoIf|if|fixme|fail|failing)\b|\bx(?:it|test|describe)\b/g;

/**
 * PURE: the change's added lines → problems that block a stop, and notes Devesh should see.
 * `usersOf(name, file)` lists the files that use an export: other files, plus `file` itself when the
 * name is used there beyond its declaration.
 */
export function checkRules(
  files: string[],
  added: Added[],
  usersOf: (name: string, file: string) => string[],
): { problems: string[]; notes: string[] } {
  const problems: string[] = [];
  const notes: string[] = [];
  const stubListed = added.some(
    (a) => a.file === "STATE.md" && /\|\s*Stub\s*\|/.test(a.text),
  );
  // A test that reads files AND names a source path (outside its imports) is reading code as text.
  const readsSource = new Set(
    added
      .filter(
        (a) =>
          TEST.test(a.file) &&
          SOURCE_PATH.test(a.text) &&
          !/^\s*(import|export)\b|\bfrom\s+["'`]|\b(require|import)\s*\(|mock\.module\s*\(/.test(
            a.text,
          ),
      )
      .map((a) => a.file),
  );
  for (const [i, a] of added.entries()) {
    if (!CODE.test(a.file) || a.file.startsWith("scripts/done-gate")) continue; // this file quotes what it bans
    const explained = a.text.match(
      /(?:biome-ignore\S*|@ts-expect-error)\s*:?\s*(.*)$/,
    );
    if (explained)
      notes.push(
        `checker silenced at ${a.file}:${a.line}: ${explained[1] || "(no reason given)"}`,
      );
    const stmt = statementAt(added, i);
    const problem = lineProblem(
      a,
      stmt.code,
      stubListed,
      readsSource.has(a.file),
      usersOf,
    );
    if (!problem) continue;
    // The reason after the marker, on any line of the statement (the formatter may move it past a wrapped
    // throw); a ")" it didn't open closed "(done-gate: allow …)" around it.
    const raw = (stmt.lines.find((l) => l.includes(ALLOW)) ?? a.text)
      .split(ALLOW)[1]
      ?.replace(/\*\/\s*$/, "")
      .trim();
    const why =
      raw && raw.split(")").length > raw.split("(").length
        ? raw.slice(0, raw.lastIndexOf(")")).trim()
        : raw;
    if (why === undefined) problems.push(`${a.file}:${a.line} ${problem}`);
    else
      notes.push(`exception at ${a.file}:${a.line}${why ? ` (${why})` : ""}`);
  }
  const rules = files.filter((f) => RULE_FILES.test(f));
  if (rules.length)
    notes.push(`changed what "done" means: ${rules.join(", ")}`);
  return { problems, notes };
}

function lineProblem(
  { file, text }: Added,
  stmt: string,
  stubListed: boolean,
  readsSource: boolean,
  usersOf: (name: string, file: string) => string[],
) {
  if (/@ts-(ignore|nocheck)\b/.test(text))
    return "switches the type checker off without a reason; fix the cause instead";
  if (TEST.test(file) && skips(text))
    return "skips or singles out a test; every test must run";
  if (
    TEST.test(file) &&
    file !== "tests/test-companies.ts" &&
    DELETES_SHARED.test(stmt) &&
    !/\bpgboss\.\w+\s+where\s+id\s*=\s*\$\d/i.test(stmt)
  )
    return "deletes companies or queued jobs other than through tests/test-companies.ts, which deletes only what this test made; a broader delete removes another test run's (delete a job only by its id)";
  if (TEST.test(file))
    return readsSource &&
      /\b(readFileSync|readFile|Bun\.file)\s*\(/.test(text) &&
      !/fixture|\.(json|sql|csv|toml|ya?ml|txt)\b/.test(text)
      ? "reads source code as text; test what the code does (render it, call it, drive it), not what it says"
      : undefined;
  if (!PRODUCT.test(file)) return;
  if (
    !stubListed &&
    /\bthrow\b.*\b(not (yet )?(implemented|wired)|unimplemented|stub)\b|\bnot(Wired|Implemented)\s*\(|\bthrow\s+(new\s+)?NotImplemented\w*/i.test(
      stmt,
    )
  )
    return "adds a placeholder that throws; build the real thing, or list it as Stub in STATE.md → What works today in this same change";
  const name = exportsOf(stmt).find(
    (n) => !usersOf(n, file).some((f) => !TEST.test(f)),
  );
  if (name)
    return `exports ${name === "default" ? "a default" : name}, but nothing outside tests uses it; land it together with the code that calls it`;
}

/** PURE: does this added line switch a test off? A line that starts with "*" is inside a comment, up to its end. */
const skips = (line: string) => {
  const code = uncommented(line.replace(/^\s*(?=\*).*?(?:\*\/|$)/, ""));
  return [...code.matchAll(SKIP)].some(
    ([, runner]) =>
      !runner ||
      !new RegExp(
        `\\b(?:const|let|var)\\s+${runner}\\b|\\b${runner}\\s*\\)?\\s*=>`,
      ).test(code),
  );
};

export const isProduct = (f: string) => PRODUCT.test(f) && !TEST.test(f);

export const rulesOn = (snap: Snap) =>
  checkRules(
    snap.files,
    snap.added,
    (name, file) => snap.users.get(`${file} ${name}`) ?? [],
  );
export const listed = (problems: string[]) =>
  `${problems.map((p) => `- ${p}`).join("\n")}\nFix each one. For a deliberate exception, add \`${ALLOW} <why>\` to that line; Devesh sees every exception.`;
