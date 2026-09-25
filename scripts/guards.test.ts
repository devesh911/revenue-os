// S4.1 guard (lessons 2026-09-25: the VPS address sat in tracked files and gitleaks, which hunts
// credentials, missed it). Each case runs the real scripts/guards.sh inside a throwaway git repo —
// the other guards find nothing to scan there and pass. Public test addresses are assembled at
// runtime so this file never trips the guard it tests.
import { afterAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const GUARDS = join(import.meta.dir, "guards.sh");
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function runGuards(files: Record<string, string>, { git = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "guards-"));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files))
    writeFileSync(join(dir, name), body);
  if (git) {
    for (const args of [
      ["init", "-q"],
      ["add", "."],
    ])
      expect(spawnSync("git", args, { cwd: dir }).status).toBe(0);
  }
  const r = spawnSync("bash", [GUARDS], { cwd: dir, encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}

const ip = (...octets: number[]) => octets.join(".");
const PUBLIC = ip(1, 1, 1, 1);
const JUST_PAST_172_16_12 = ip(172, 32, 0, 1); // public: 172.16/12 ends at 172.31

describe("guard S4.1 · public IPv4 literal in tracked files", () => {
  it("passes reserved ranges and address-shaped non-addresses", () => {
    const { code, out } = runGuards({
      "ok.md": [
        "docs: 192.0.2.10 198.51.100.7 203.0.113.99",
        "local: 127.0.0.1 0.0.0.0 10.1.2.3 172.16.0.1 172.31.255.255 192.168.1.1 169.254.169.254",
        // a version, a 5-part run, an octet over 255, an SVG path command
        "not addresses: v1.2.3.4 1.2.3.4.5 256.1.1.1 M12.5.3.4",
      ].join("\n"),
    });
    expect(out).toMatch(/guard S4\.1[^\n]*\n\s+PASS/);
    expect(code).toBe(0);
  });

  it("fails on a public address with file:line only — the address never prints", () => {
    const { code, out } = runGuards({
      "notes.md": [
        "intro",
        `the VPS is at ${PUBLIC}.`, // sentence-final full stop still counts
        `url: http://${PUBLIC}:8080/`,
        `${ip(10, 0, 0, 1)},${JUST_PAST_172_16_12}`, // private neighbour doesn't shield it
      ].join("\n"),
    });
    expect(code).toBe(1);
    for (const line of ["notes.md:2", "notes.md:3", "notes.md:4"])
      expect(out).toContain(line);
    expect(out).toContain("FAIL — S4.1");
    expect(out).not.toContain(PUBLIC);
    expect(out).not.toContain(JUST_PAST_172_16_12);
  });

  it("fails loudly when git grep cannot run — an unscanned tree never passes", () => {
    const { code, out } = runGuards({ "x.md": "x" }, { git: false });
    expect(code).toBe(1);
    expect(out).toContain("nothing was scanned");
  });

  it("excuses exactly one path (the SVG icon file) — a path allowlist hides future leaks", () => {
    const excused = [
      ...readFileSync(GUARDS, "utf8").matchAll(/':!([^']+)'/g),
    ].map((m) => m[1]);
    expect(excused).toEqual(["apps/www/src/visuals/IntentEvidence.tsx"]);
  });
});
