// RED spec for TASK-34 — www componentization · BUILD GATE.
// The retired static world had NO build step; the component rewrite ships a Vite
// app (react + react-dom + tailwind v4, the console's stack). This gate proves
// apps/www actually builds into a bundled component app that carries the hero copy.
//
// It runs `bun run build` (apps/www's "build": "vite build" script) with cwd
// pinned to apps/www — exercising the workspace-installed vite. We deliberately do
// NOT shell out to `bunx vite` (that auto-installs vite over the network); the
// build must come from a real, declared devDependency.
//
// RED today: apps/www has no package.json / no vite setup, so `bun run build`
// exits non-zero → the build-succeeded assertion fails (a clean assertion, the
// execSync throw is caught). NOTE: in this env-free worktree vite is not installed
// for www, so the *success* path is CI-owned (deps installed) — the same command,
// green once GREEN adds the app + devDeps. Reported as such.
import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const WWW_DIR = resolve(import.meta.dir, "..");
const DIST_DIR = resolve(WWW_DIR, "dist");
// Hero headline stem (nbsp-robust) — the one string that proves the component
// tree, not just an empty shell, made it into the bundle.
const HERO = "The revenue operating system for Indian real";

describe("AC build gate — apps/www builds into a bundled component app", () => {
  test("vite build succeeds and emits a JS bundle carrying the hero copy", () => {
    let built = false;
    let out = "";
    try {
      out = execSync("bun run build", {
        cwd: WWW_DIR,
        stdio: "pipe",
        timeout: 240_000,
      }).toString();
      built = true;
    } catch (err) {
      const e = err as { stdout?: Buffer; stderr?: Buffer };
      out = `${e.stdout?.toString() ?? ""}${e.stderr?.toString() ?? String(err)}`;
      built = false;
    }
    // RED today: no apps/www/package.json + no vite → `bun run build` is non-zero.
    expect(
      built,
      `\`bun run build\` must succeed in apps/www (vite build). Output:\n${out}`,
    ).toBe(true);

    // Vite default output: a static shell + hashed assets under dist/assets.
    expect(
      existsSync(resolve(DIST_DIR, "index.html")),
      "vite build must emit dist/index.html",
    ).toBe(true);
    const assetsDir = resolve(DIST_DIR, "assets");
    const jsFiles = existsSync(assetsDir)
      ? readdirSync(assetsDir).filter((f) => f.endsWith(".js"))
      : [];
    expect(
      jsFiles.length,
      "dist/assets must contain a bundled JS asset (the component app)",
    ).toBeGreaterThan(0);

    // The bundled app must carry the hero copy — proof the tree built.
    const heroInBundle = jsFiles.some((f) =>
      readFileSync(resolve(assetsDir, f), "utf8").includes(HERO),
    );
    expect(
      heroInBundle,
      "the bundled JS must contain the hero headline copy",
    ).toBe(true);
  }, 260_000);
});
