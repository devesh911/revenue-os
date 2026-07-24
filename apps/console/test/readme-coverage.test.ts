// task-28 ui-foundation-v2 · A1-RED — README coverage guard.
// The durable "self-explanatory repo" enforcement: every console folder that holds source or
// tests must carry a README.md that actually says something (≥3 non-empty lines). Covers
// apps/console/ · apps/console/src/{,pages,features,lib,app,screens} · apps/console/test/.
// Env-free by construction (bun test + Bun.file, no DB/network). Paths are CWD-relative, so the
// suite is run from the repo/worktree root — the same convention as tests/console-boot-honesty.
import { describe, expect, it } from "bun:test";

const README_DIRS = [
  "apps/console",
  "apps/console/src",
  "apps/console/src/pages",
  "apps/console/src/features",
  "apps/console/src/lib",
  "apps/console/src/app",
  "apps/console/src/screens",
  "apps/console/test",
];

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
