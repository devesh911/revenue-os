// The tests a Proof line cites by name (scripts/proof/named-tests.ts), as the banner and merge steps run them: each
// alone, by its name, in the proved checkout; a renamed, deleted or failing one fails the step that cites it.
import { afterAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { namedTestsPass } from "./proof/named-tests";

setDefaultTimeout(120_000); // each cited test runs in a bun of its own
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const scratch = (name: string) => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), name)));
  dirs.push(d);
  return d;
};

describe("the tests the Proof line cites by name", () => {
  it("pass only when each runs alone and passes: a renamed or failing one fails the step, naming it", () => {
    const dir = scratch("proof-0-cited-");
    writeFileSync(
      join(dir, "cited.test.ts"),
      'import { expect, test } from "bun:test";\ntest("still here (its name has brackets)", () => expect(1 + 1).toBe(2));\ntest("now broken", () => expect(1 + 1).toBe(3));\n',
    );
    const here = "still here (its name has brackets)";
    expect(namedTestsPass(dir, "cited.test.ts", [here])).toContain(
      "each ran alone and passed",
    );
    expect(() =>
      namedTestsPass(dir, "cited.test.ts", [here, "now broken", "renamed"]),
    ).toThrow(/2 cited test\(s\).*"now broken".*"renamed"/s);
  });
});
