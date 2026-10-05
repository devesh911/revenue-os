// For guardrail, tenancy and money code, the gate breaks each new line on purpose and a test must then fail
// (scripts/done-gate/broken-lines.ts says which files and how a line is broken). Here the pure part, on text.
import { describe, expect, it } from "bun:test";
import { breaksOf, codeMask, kindOf } from "./done-gate/broken-lines";

/** The broken copies of `line` in `src`, each as what was done and the line or statement shown. */
const broken = (src: string, line: number) =>
  breaksOf(src, line).map((b) => `${b.how}: ${b.shown}`);

describe("kindOf: which files are guardrail, tenancy or money code", () => {
  it("names each kind by path, and leaves out tests, type declarations and other files", () => {
    expect(kindOf("packages/harness/src/policies.ts")).toBe("guardrail");
    expect(kindOf("packages/channels/src/whatsapp.ts")).toBe("guardrail");
    expect(kindOf("services/worker/src/routes/guardrail-policies.ts")).toBe(
      "guardrail",
    );
    expect(kindOf("packages/db/src/guardrails.ts")).toBe("guardrail");
    expect(kindOf("packages/db/src/client.ts")).toBe("tenancy");
    expect(kindOf("services/worker/src/routes/contacts.ts")).toBe("tenancy");
    expect(kindOf("services/worker/src/auth.ts")).toBe("tenancy");
    expect(kindOf("packages/harness/src/meter.ts")).toBe("money");
    expect(kindOf("packages/db/test/rls.test.ts")).toBeUndefined();
    expect(kindOf("packages/db/src/types.d.ts")).toBeUndefined();
    expect(kindOf("packages/db/src/notes.md")).toBeUndefined();
    expect(kindOf("services/worker/src/scheduler.ts")).toBeUndefined();
    expect(kindOf("packages/db/src/schema.ts")).toBeUndefined(); // describes tables, runs no query
    expect(kindOf("apps/console/src/main.tsx")).toBeUndefined();
  });
});

describe("codeMask: code kept, everything else blanked", () => {
  it("blanks comments and the inside of strings, template text and regexes, keeping offsets and template holes", () => {
    const src = [
      'const a = "x === y"; // a && b',
      `const t = \`if (${"$"}{a === 1}) true\`;`,
      "/* x > 1 */ const r = /a||b/g.test(s) && 4 / 2 > 1;",
    ].join("\n");
    const mask = codeMask(src);
    expect(mask.length).toBe(src.length);
    expect(mask.split("\n")).toEqual([
      'const a = "       ";          ',
      "const t = `    $(a === 1)      `;",
      "            const r = /    /g.test(s) && 4 / 2 > 1;",
    ]);
  });
});

describe("breaksOf: up to two broken copies of a line", () => {
  const fn = (body: string) =>
    `export function f(a: number, b: number) {\n${body}\n  return 0;\n}\n`;

  it("flips each kind of condition", () => {
    for (const [from, to] of [
      ["a === b", "a !== b"],
      ["a !== b", "a === b"],
      ["a == b", "a != b"],
      ["a != b", "a == b"],
      ["a < b", "a >= b"],
      ["a >= b", "a < b"],
      ["a > b", "a <= b"],
      ["a <= b", "a > b"],
      ["a && b", "a || b"],
      ["a || b", "a && b"],
      ["!a", "a"],
    ])
      expect(broken(fn(`  if (${from}) return 1;`), 2)[0]).toBe(
        `flip: if (${to}) return 1;`,
      );
    expect(broken(fn("  const ok = true;\n  if (ok) return 1;"), 2)[0]).toBe(
      "flip: const ok = false;",
    );
  });

  it("negates a bare if or while condition, and a ternary's", () => {
    expect(broken(fn("  if (a) return 1;"), 2)[0]).toBe(
      "flip: if (!(a)) return 1;",
    );
    expect(broken(fn("  while (a) a--;"), 2)[0]).toBe(
      "flip: while (!(a)) a--;",
    );
    expect(broken(fn("  const c = a ? 1 : 2;\n  return c;"), 2)[0]).toBe(
      "flip: const c = !(a) ? 1 : 2;",
    );
  });

  it("removes the statement the line starts: a call, a return, a throw, an if with its block, a declaration", () => {
    const src = [
      "export function f(a: number, log: (s: string) => void) {", // 1
      '  log("start");', // 2
      "  if (a > 1) {", // 3
      '    throw new Error("big");', // 4
      "  }", // 5
      "  const b = a +", // 6
      "    1;", // 7
      "  return b;", // 8
      "}", // 9
    ].join("\n");
    expect(broken(src, 2)).toEqual(['remove: log("start");']);
    expect(broken(src, 3)).toEqual([
      "flip: if (a <= 1) {",
      "remove: if (a > 1) {",
    ]);
    expect(breaksOf(src, 3)[1]?.text).toBe(
      src.replace('  if (a > 1) {\n    throw new Error("big");\n  }', "  \n\n"),
    );
    expect(broken(src, 4)).toEqual(['remove: throw new Error("big");']);
    expect(broken(src, 6)).toEqual(["remove: const b = a +"]);
    expect(broken(src, 8)).toEqual(["remove: return b;"]);
    expect(broken(src, 5)).toEqual([]); // a closing brace: nothing to break
    expect(broken(src, 7)).toEqual([]); // the middle of a statement, nothing to flip
  });

  it("removes a line holding whole list items: an argument or a property", () => {
    const src = [
      "export const q = (db: { query: (s: string, v: unknown[]) => void }, org: string, id: string) =>", // 1
      "  db.query(", // 2
      '    "select 1 where org_id = $1 and id = $2",', // 3
      "    [org, id],", // 4
      "  );", // 5
      "export const row = (org: string) => ({", // 6
      "  org_id: org,", // 7
      "  open: true,", // 8
      "});", // 9
    ].join("\n");
    expect(broken(src, 4)).toEqual(["remove: [org, id],"]);
    expect(broken(src, 7)).toEqual(["remove: org_id: org,"]);
    expect(broken(src, 8)).toEqual([
      "flip: open: false,",
      "remove: open: true,",
    ]);
  });

  it("never touches a string, a template's text, a regex or a comment on the line", () => {
    const src = fn(
      '  const s = "a === b && c"; // if (a < b) return a || b;\n  const t = `x > ' +
        "$" +
        "{a} && y`;\n  const r = /a||b/;",
    );
    expect(broken(src, 2)).toEqual(['remove: const s = "a === b && c";']);
    expect(broken(src, 3)).toEqual([
      `remove: const t = \`x > ${"$"}{a} && y\`;`,
    ]);
    expect(broken(src, 4)).toEqual(["remove: const r = /a||b/;"]);
  });

  it("drops a copy that would not parse, and one that changes only types", () => {
    const src = [
      "export type Big = Array<number>;", // 1: a type: nothing that runs changes
      "import type { X } from './x';", // 2
      "export const f = (a: Array<number>): a is never => a.length > 1;", // 3
    ].join("\n");
    expect(broken(src, 1)).toEqual([]);
    expect(broken(src, 2)).toEqual([]);
    expect(
      broken('import { y } from "./y";\nexport const f = () => y;\n', 1),
    ).toEqual(['remove: import { y } from "./y";']);
    // `Array<number>` flipped would not parse, so the comparison is the one flipped
    expect(broken(src, 3)).toEqual([
      "flip: export const f = (a: Array<number>): a is never => a.length <= 1;",
      "remove: export const f = (a: Array<number>): a is never => a.length > 1;",
    ]);
  });

  it("leaves arrows, shifts and a non-null assertion alone", () => {
    const src = fn("  const g = (x: number) => x >> 1;\n  return g(a!)");
    expect(broken(src, 2)).toEqual([
      "remove: const g = (x: number) => x >> 1;",
    ]);
  });
});
