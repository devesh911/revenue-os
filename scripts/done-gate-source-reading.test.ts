// The done rules refuse a test file that reads source code as text (scripts/done-gate/rules.ts), and that refusal
// stays as tight as it was: structure rules and secret scans live in lint (biome.json) and `bun run guards`
// (scripts/guards/), never in a test file, so no exception is ever needed. Bun can also read a file as text by
// importing it (`with { type: "text" }`), which reads nothing through readFileSync or Bun.file; that is refused too.
import { describe, expect, it } from "bun:test";
import { checkRules } from "./done-gate/rules";

const READS =
  "reads source code as text; test what the code does (render it, call it, drive it), not what it says";
const problemsOf = (file: string, ...lines: string[]) =>
  checkRules(
    [file],
    lines.map((text, i) => ({ file, line: i + 1, text })),
    () => [],
  ).problems;

describe("a test that reads source code as text", () => {
  const test = "apps/console/test/home.test.tsx";

  it("is refused when it reads the file", () => {
    expect(
      problemsOf(
        test,
        'const HOME_SRC = "apps/console/src/pages/Home.tsx";',
        "expect(await Bun.file(HOME_SRC).text()).toMatch(/<DataShell/);",
      ),
    ).toEqual([`${test}:2 ${READS}`]);
  });

  it("is refused when it imports a code file as text, statically or on demand", () => {
    for (const line of [
      'import home from "../src/pages/Home/index.tsx" with { type: "text" };',
      "import main from '../src/main.tsx' with {type:'text'};",
      'const src = await import("../src/main.tsx", { with: { type: "text" } });',
      'const api = (await import("../../src/lib/api.ts", { with: { type: "text" } })).default;',
    ])
      expect(problemsOf(test, line)).toEqual([`${test}:1 ${READS}`]);
    // The formatter wraps a long one: the path sits on the line above.
    expect(
      problemsOf(
        test,
        'const src = await import("../src/pages/Conversations/index.tsx", {',
        '  with: { type: "text" },',
        "});",
      ),
    ).toEqual([`${test}:2 ${READS}`]);
  });

  it("is not refused for importing code to run it, or a data file as text", () => {
    for (const line of [
      'import { HomePage } from "../src/pages/Home/index";',
      'const { Boot } = await import("../src/app/Boot.tsx");',
      'import rows from "./fixtures/leads.csv" with { type: "text" };',
      'import config from "../../../.gitleaks.toml" with { type: "text" };',
    ])
      expect(problemsOf(test, line)).toEqual([]);
  });
});
