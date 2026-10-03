// A new migration counts as covered only when the same change adds or edits a database test on the local stack
// that uses what it adds: each table it creates is named in a cross-company denial test, and anything else it adds
// (a function, view, type, sequence or column), or the tables it changes when it adds none of those, is named in a
// database test. "Uses" is read from names, so this check's limits are: a test file counts as a database test when
// it connects to the database (withOrg, a pg Pool or Client, createPool, testCompanies, LOCAL_DB_URL or
// DATABASE_URL), and as a denial test when it also runs as one company through withOrg and expects nothing back or
// a refusal; a name counts as used when a line the change adds to such a test holds it as a whole word, in a query
// or anywhere else, so a test that names a table without asking another company for it still passes.

import type { Added } from "./diff";
import { isTest } from "./rules";

const MIGRATION = /^supabase\/migrations\/\d+_[^/]*\.sql$/;
const DB_TEST =
  /\bwithOrg\s*\(|\bnew\s+(?:Pool|Client)\s*\(|\bcreatePool\s*\(|\btestCompanies\s*\(|\bLOCAL_DB_URL\b|\bDATABASE_URL\b/;
const REFUSED =
  /\.toHaveLength\(0\)|\.toEqual\(\[\]\)|\.rejects\b|row-level security/;
const NAME = String.raw`(?:"?\w+"?\.)?"?(\w+)"?`; // schema-qualified or not, quoted or not
const TABLES = new RegExp(
  String.raw`\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${NAME}`,
  "gi",
);
const OTHERS = new RegExp(
  String.raw`\b(?:create\s+(?:or\s+replace\s+)?(?:function|procedure|(?:materialized\s+)?view|type|sequence)|add\s+column)\s+(?:if\s+not\s+exists\s+)?${NAME}`,
  "gi",
);
const CHANGED = new RegExp(
  String.raw`\b(?:alter\s+table(?:\s+if\s+exists)?(?:\s+only)?|insert\s+into|(?:index|policy|trigger)\b[^;]*?\bon)\s+${NAME}`,
  "gi",
);

const names = (sql: string, re: RegExp) => [
  ...new Set([...sql.matchAll(re)].map((m) => (m[1] ?? "").toLowerCase())),
];
const named = (lines: string[], name: string) =>
  lines.some((l) => new RegExp(`\\b${name}\\b`, "i").test(l));

/** The change's added lines and a way to read a file as the change leaves it → each new migration nothing tests. */
export function untestedMigrations(
  added: Added[],
  read: (file: string) => string,
): string[] {
  const tests = [
    ...new Set(added.filter((a) => isTest(a.file)).map((a) => a.file)),
  ]
    .map((file) => ({ file, text: read(file) }))
    .filter((t) => DB_TEST.test(t.text));
  const linesOf = (only: typeof tests) =>
    added.filter((a) => only.some((t) => t.file === a.file)).map((a) => a.text);
  const inDbTests = linesOf(tests);
  const inDenials = linesOf(
    tests.filter((t) => /\bwithOrg\s*\(/.test(t.text) && REFUSED.test(t.text)),
  );
  const problems: string[] = [];
  for (const file of new Set(added.map((a) => a.file))) {
    if (!MIGRATION.test(file)) continue;
    const sql = added
      .filter((a) => a.file === file)
      .map((a) => a.text.replace(/--.*$/, ""))
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const tables = names(sql, TABLES);
    for (const t of tables.filter((t) => !named(inDenials, t)))
      problems.push(
        `${file} creates the table ${t}, but no database test this change adds or edits names it in a cross-company denial test (another company's read or write refused)`,
      );
    const others = names(sql, OTHERS);
    const used = tables.length || others.length ? others : names(sql, CHANGED);
    const unnamed = used.filter((n) => !named(inDbTests, n));
    if (unnamed.length)
      problems.push(
        `${file} adds or changes ${unnamed.join(", ")}, but no database test this change adds or edits names them`,
      );
    if (!tables.length && !used.length && !inDbTests.length)
      problems.push(
        `${file} adds nothing this check can name, and the change adds or edits no database test: add a behaviour test on the local stack that uses what it does`,
      );
  }
  return problems;
}
