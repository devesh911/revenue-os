// task-28 ui-foundation-v2 · A1-RED — README coverage guard.
// The durable "self-explanatory repo" enforcement: every console folder that holds source or
// tests must carry a README.md that actually says something (≥3 non-empty lines). The src/*
// children are DERIVED (readdirSync) so a new source folder is guarded the moment it lands — a
// hardcoded list silently missed src/ui. The fixed roots bookend them: apps/console and
// apps/console/src (the authoritative folder map) plus the sibling apps/console/test.
// Env-free by construction (bun test + node:fs + Bun.file, no DB/network). Paths are CWD-relative,
// so the suite is run from the repo/worktree root — the same convention as tests/console-boot-honesty.
import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";

const SRC = "apps/console/src";
const srcDirs = readdirSync(SRC, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `${SRC}/${entry.name}`);

const README_DIRS = ["apps/console", SRC, ...srcDirs, "apps/console/test"];

const nonEmptyLineCount = (text: string): number =>
  text.split("\n").filter((line) => line.trim().length > 0).length;

describe("README coverage — every console folder is self-explanatory", () => {
  for (const dir of README_DIRS) {
    const path = `${dir}/README.md`;
    it(`${path} exists and has at least 3 non-empty lines`, async () => {
      const file = Bun.file(path);
      const exists = await file.exists();
      expect(exists).toBe(true); // missing README fails here — a clean assertion
      const text = exists ? await file.text() : "";
      expect(nonEmptyLineCount(text)).toBeGreaterThanOrEqual(3);
    });
  }
});
