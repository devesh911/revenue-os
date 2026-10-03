// The structure rules biome.json holds, so no test file has to read source code to check them (STATE.md →
// Decisions in force, "Behaviour is proved by behaviour tests"): no package imports the Anthropic SDK (the model
// adapter is raw fetch), only the console's src/lib/supabase.ts imports the Supabase client package, types included
// (everything else goes through its lazy getSupabase()), and no console code injects raw HTML. Each case lints
// throwaway files with the repository's real lint settings, then the real code, which must pass.
import { afterAll, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const root = join(import.meta.dir, "..");
const biome = join(root, "node_modules", ".bin", "biome");
const dir = mkdtempSync(join(tmpdir(), "lint-structure-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const put = (file: string, body: string) => {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), body);
};
/** The files biome flags for `rule`, from a lint run in `cwd` over `paths`. */
function flagged(cwd: string, rule: string, paths = ["."]) {
  const r = spawnSync(biome, ["lint", "--max-diagnostics=200", ...paths], {
    cwd,
    encoding: "utf8",
  });
  return [
    ...`${r.stdout}${r.stderr}`.matchAll(
      new RegExp(`^(\\S+):\\d+:\\d+ lint/\\w+/${rule}\\b`, "gm"),
    ),
  ]
    .map(([, file]) => file)
    .sort();
}

const SDK =
  'import Anthropic from "@anthropic-ai/sdk";\nexport const a = Anthropic;\n';
const SDK_PART =
  'import { Messages } from "@anthropic-ai/sdk/resources";\nexport const m = Messages;\n';
const CLIENT =
  'import { createClient } from "@supabase/supabase-js";\nexport const c = createClient;\n';
const CLIENT_TYPE =
  'import type { Session } from "@supabase/supabase-js";\nexport type S = Session;\n';
const RAW_HTML =
  "export const X = ({ h }: { h: string }) => <div dangerouslySetInnerHTML={{ __html: h }} />;\n";

it("fails the Anthropic SDK in any package, the Supabase client outside the console's lib/supabase.ts, and raw HTML in the console", () => {
  for (const config of [
    "biome.json",
    "apps/console/biome.json",
    "apps/www/biome.json",
  ]) {
    mkdirSync(dirname(join(dir, config)), { recursive: true });
    copyFileSync(join(root, config), join(dir, config));
  }
  put("packages/harness/src/llm/anthropic.ts", SDK);
  put("packages/db/src/x.ts", SDK_PART);
  put("packages/harness/test/x.test.ts", SDK);
  put("apps/console/src/lib/supabase.ts", CLIENT);
  put("apps/console/src/lib/other.ts", CLIENT);
  put("apps/console/src/app/session/x.tsx", CLIENT_TYPE);
  put("apps/console/src/pages/x.tsx", RAW_HTML);
  put("scripts/x.ts", SDK + CLIENT.replace("const c", "const d"));
  spawnSync("git", ["init", "-q"], { cwd: dir });

  expect(flagged(dir, "noRestrictedImports")).toEqual([
    "apps/console/src/app/session/x.tsx",
    "apps/console/src/lib/other.ts",
    "packages/db/src/x.ts",
    "packages/harness/src/llm/anthropic.ts",
    "packages/harness/test/x.test.ts",
  ]);
  expect(flagged(dir, "noDangerouslySetInnerHtml")).toEqual([
    "apps/console/src/pages/x.tsx",
  ]);
});

it("passes the real console and packages", () => {
  const real = ["apps/console/src", "apps/console/test", "packages"];
  expect(flagged(root, "noRestrictedImports", real)).toEqual([]);
  expect(flagged(root, "noDangerouslySetInnerHtml", real)).toEqual([]);
});
