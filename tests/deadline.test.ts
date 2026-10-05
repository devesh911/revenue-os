// A wait with a deadline fails, saying what ran late and how busy the machine is, before bun's own time limit
// lets the file's clean-up run under a check still in progress; work that finishes in time leaves no timer behind.
import { expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpus } from "node:os";
import { join } from "node:path";
import { within } from "./deadline";

it("fails work that runs late, naming it and this machine's load", async () => {
  const never = new Promise<number>(() => {});
  const late = await within(50, "the slow runs", never).catch((e: Error) => e);
  expect(late).toBeInstanceOf(Error);
  expect((late as Error).message).toMatch(
    new RegExp(
      `^the slow runs did not finish within 0\\.05 s, so nothing was checked; this machine's load average is \\d+ on ${cpus().length} cores$`,
    ),
  );
});

it("hands back work that finishes in time, and leaves no timer keeping the run alive", () => {
  const started = Date.now();
  const r = spawnSync(
    process.execPath,
    [
      "-e",
      `const { within } = await import(${JSON.stringify(join(import.meta.dir, "deadline.ts"))});
       console.log(await within(60_000, "the quick runs", Promise.resolve(7)));`,
    ],
    { encoding: "utf8" },
  );
  expect(r.stdout.trim()).toBe("7");
  expect(Date.now() - started).toBeLessThan(30_000); // a pending 60 s timer would hold it open
}, 90_000);
