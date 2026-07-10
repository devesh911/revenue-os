// Lessons 2026-07-10 (gitleaks near-miss) + D32 follow-up: the S9.3 allowlist must excuse
// the two historical commits that carried the designed-public LOCAL demo anon key
// (slipped in via 4796388 on a stale-.gitignore branch, removed in b207595 the same day —
// both patches show the key string), NEVER the path. A path-scoped allowlist makes any
// FUTURE secret committed at apps/console/.env.local permanently invisible to gitleaks.
// Adding a commit to this allowlist is a reviewed act: update the expected set here in the
// same PR, with justification in the .gitleaks.toml comment.
import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const config = readFileSync(
  join(import.meta.dir, "..", ".gitleaks.toml"),
  "utf8",
);

const KNOWN_EXCUSED_COMMITS = [
  "479638836a9d8776095dadda4a85b22182c66e82", // env.local slipped into a biome-format commit
  "b20759513e5bdbb5aa235df7051be937cedc31ec", // its removal (deletion patch still shows the key)
].sort();

describe("gitleaks allowlist (S9.3) is commit-scoped, never path-scoped", () => {
  it("keeps the default ruleset enabled", () => {
    expect(config).toMatch(/^\s*useDefault\s*=\s*true\s*$/m);
  });

  it("has no path-scoped allowlist entries", () => {
    expect(config).not.toMatch(/^\s*paths\s*=/m);
  });

  it("excuses exactly the two known historical commits, by full sha", () => {
    const commitsBlock = config.match(/^\s*commits\s*=\s*\[([\s\S]*?)\]/m);
    expect(commitsBlock).not.toBeNull();
    const shas = [
      ...(commitsBlock as RegExpMatchArray)[1].matchAll(/"([^"]+)"/g),
    ]
      .map((m) => m[1])
      .sort();
    expect(shas).toEqual(KNOWN_EXCUSED_COMMITS);
    for (const sha of shas) {
      expect(sha).toMatch(/^[0-9a-f]{40}$/); // gitleaks matches exact full hashes
    }
  });

  it("every excused commit exists in this repository's history", () => {
    for (const sha of KNOWN_EXCUSED_COMMITS) {
      // throws (non-zero exit) if the object is not a known commit
      execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], {
        cwd: join(import.meta.dir, ".."),
      });
    }
  });
});
