// The structure rule apps/console/biome.json holds, so no test file has to read source code to check it (STATE.md →
// Decisions in force, "Behaviour is proved by behaviour tests"): in the console's src/, only lib/supabase.ts uses the
// Supabase client package, types included, imported or required; everything else goes through its lazy
// getSupabase(). It lints throwaway files with the repository's real lint settings, then the real code, which must
// pass. Text-shaped rules (the Anthropic SDK in packages, raw HTML in the console) are guards: guards-sdk-raw-html.test.ts.
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

const CLIENT =
  'import { createClient } from "@supabase/supabase-js";\nexport const c = createClient;\n';
const CLIENT_TYPE =
  'import type { Session } from "@supabase/supabase-js";\nexport type S = Session;\n';
const CLIENT_REQUIRED =
  'const { createClient } = require("@supabase/supabase-js");\nexport const c = createClient;\n';

it("fails the Supabase client package in the console's src/ outside lib/supabase.ts, however it is loaded", () => {
  for (const config of [
    "biome.json",
    "apps/console/biome.json",
    "apps/www/biome.json",
  ]) {
    mkdirSync(dirname(join(dir, config)), { recursive: true });
    copyFileSync(join(root, config), join(dir, config));
  }
  put("apps/console/src/lib/supabase.ts", CLIENT);
  put("apps/console/src/lib/other.ts", CLIENT);
  put("apps/console/src/app/session/x.tsx", CLIENT_TYPE);
  put("apps/console/src/pages/x.ts", CLIENT_REQUIRED);
  put("scripts/x.ts", CLIENT);
  spawnSync("git", ["init", "-q"], { cwd: dir });

  expect(flagged(dir, "noRestrictedImports")).toEqual([
    "apps/console/src/app/session/x.tsx",
    "apps/console/src/lib/other.ts",
    "apps/console/src/pages/x.ts",
  ]);
});

it("passes the real console", () => {
  expect(flagged(root, "noRestrictedImports", ["apps/console/src"])).toEqual(
    [],
  );
});
