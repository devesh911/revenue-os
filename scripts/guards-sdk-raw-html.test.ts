// Two guards `bun run guards` runs in place of tests that read source code as text: no package uses an @anthropic-ai
// module, since the model adapter is raw fetch (scripts/guards/anthropic-sdk.sh), and no console code puts a string
// into the page as HTML (scripts/guards/raw-html.sh). Each case runs the real scripts/guards.sh in a throwaway git
// repo holding the files; the other guards find nothing there to fail.
import { afterAll, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const GUARDS = join(import.meta.dir, "guards.sh");
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function guards(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "guards-code-"));
  dirs.push(dir);
  const all = { "docs/patterns/none.md": "# Pattern: none yet\n", ...files };
  for (const [name, body] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), body);
  }
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["add", "."], { cwd: dir });
  const r = spawnSync("bash", [GUARDS], { cwd: dir, encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}

const SDK = "guard · an @anthropic-ai module in packages";
const RAW = "guard · raw HTML in console code";

it("fails an @anthropic-ai module in a package's code or dependencies, however it is loaded", () => {
  const { code, out } = guards({
    "packages/harness/src/llm/a.ts":
      'import Anthropic from "@anthropic-ai/sdk";\n',
    "packages/harness/src/llm/b.ts":
      'const r = require("@anthropic-ai/sdk/resources");\n',
    "packages/db/src/c.ts":
      "export const m = await import('@anthropic-ai/bedrock-sdk');\n",
    "packages/db/test/d.test.ts": 'export * from "@anthropic-ai/sdk";\n',
    "packages/shared/package.json":
      '{ "dependencies": { "@anthropic-ai/sdk": "1.0.0" } }\n',
  });
  expect(code).toBe(1);
  for (const at of [
    "packages/harness/src/llm/a.ts:1",
    "packages/harness/src/llm/b.ts:1",
    "packages/db/src/c.ts:1",
    "packages/db/test/d.test.ts:1",
    "packages/shared/package.json:1",
  ])
    expect(out).toContain(at);
  expect(out).toMatch(new RegExp(`${SDK}[\\s\\S]*FAIL`));
});

it("fails raw HTML in console code however it is written, a prop passed in a spread object included", () => {
  const { code, out } = guards({
    "apps/console/src/x/attr.tsx":
      "export const X = ({ h }: { h: string }) => <div dangerouslySetInnerHTML={{ __html: h }} />;\n",
    "apps/console/src/x/spread.tsx":
      "export const X = ({ h }: { h: string }) => {\n  const props = { dangerouslySetInnerHTML: { __html: h } };\n  return <div {...props} />;\n};\n",
    "apps/console/src/x/inner.ts":
      'export const X = (el: HTMLElement, h: string) => {\n  el.innerHTML = h;\n  el.insertAdjacentHTML("beforeend", h);\n};\n',
    "apps/console/src/x/write.js":
      "export const w = (h) => { document.write(h); document.body.outerHTML = h; };\n",
  });
  expect(code).toBe(1);
  for (const at of [
    "apps/console/src/x/attr.tsx:1",
    "apps/console/src/x/spread.tsx:2",
    "apps/console/src/x/inner.ts:2",
    "apps/console/src/x/inner.ts:3",
    "apps/console/src/x/write.js:1",
  ])
    expect(out).toContain(at);
  expect(out).toMatch(new RegExp(`${RAW}[\\s\\S]*FAIL`));
});

it("passes text rendered as text, the SDK named in prose, and raw HTML outside the console's code", () => {
  const { code, out } = guards({
    "packages/harness/src/llm/anthropic.ts":
      '// raw fetch, no SDK: no @anthropic-ai dependency\nexport const call = (body: string) => fetch("https://api.anthropic.com/v1/messages", { body });\n',
    "apps/console/src/x/text.tsx":
      "export const X = ({ h }: { h: string }) => <p>{h}</p>;\n",
    "apps/console/src/ui/README.md": "No `dangerouslySetInnerHTML`.\n",
    "apps/console/test/x.test.tsx": "const html = document.body.innerHTML;\n",
    "apps/www/src/x.tsx":
      "export const X = () => <div dangerouslySetInnerHTML={{ __html: '' }} />;\n",
  });
  expect(out).toMatch(new RegExp(`${SDK}\\n\\s+PASS`));
  expect(out).toMatch(new RegExp(`${RAW}\\n\\s+PASS`));
  expect(code).toBe(0);
});
