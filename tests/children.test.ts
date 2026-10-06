// A test file that starts children through tests/children.ts leaves none of them, and nothing they started,
// running once it ends, however it ends, and nothing a child started once that child ends. On 2026-10-04 the
// whole-suite runs that services/worker/test/test-runs-at-once.test.ts starts outlived it for hours and loaded the
// machine until later gate runs timed out: bun's own time limit stops a test's children but not theirs, and a test
// run stopped from outside (the gate stops one file past its 10 minutes with SIGTERM) stops none of them.
import { expect, it } from "bun:test";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const helper = join(import.meta.dir, "children.ts");

/** Is `pid` still running? */
const running = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * A child that starts a grandchild and writes both their ids to ids.txt, then sleeps, the grandchild holding its
 * output open as a whole-suite run's own children do, or ends at once, leaving the grandchild running (holding the
 * child's output open, or not).
 */
const child = (sleeps: boolean, holds = sleeps) =>
  `const g = require("node:child_process").spawn("sleep", ["30"], { stdio: "${holds ? "inherit" : "ignore"}" });
   g.unref();
   require("node:fs").writeFileSync("ids.txt", process.pid + " " + g.pid);
   ${sleeps ? "setTimeout(() => {}, 30_000);" : ""}`;

it.each([
  {
    ends: "the child ends while its test goes on",
    sleeps: false,
    rest: "await ran;\n  await Bun.sleep(30_000);",
  },
  {
    ends: "the child ends while the grandchild it started holds the child's output open",
    sleeps: false,
    holds: true,
    rest: "await ran;\n  await Bun.sleep(30_000);",
  },
  { ends: "the test runs past its time limit", sleeps: true, limit: 1_000 },
  {
    ends: "the run is stopped with SIGTERM, as the gate stops a file past its 10 minutes",
    sleeps: true,
    stop: (run: number) => process.kill(run, "SIGTERM"),
  },
  {
    ends: "Ctrl-C is pressed at the terminal (SIGINT to the run's process group)",
    sleeps: true,
    stop: (run: number) => process.kill(-run, "SIGINT"),
  },
  {
    ends: "a test in the run calls process.exit",
    sleeps: true,
    rest: `while (!require("node:fs").existsSync("ids.txt")) await Bun.sleep(50);
  process.exit(1);`,
  },
])("a child and the grandchild it started are stopped when $ends", async ({
  sleeps,
  holds,
  limit = 60_000,
  stop,
  rest = "await ran;",
}) => {
  const dir = mkdtempSync(join(tmpdir(), "children-"));
  writeFileSync(
    join(dir, "stray.test.ts"),
    `import { it } from "bun:test";
import { children } from ${JSON.stringify(helper)};
const { bun } = children();
it("starts a child", async () => {
  const ran = bun(["-e", ${JSON.stringify(child(sleeps, holds))}], import.meta.dir);
  ${rest}
}, ${limit});
`,
  );
  // In a group of its own, as a test run started at a terminal is, so Ctrl-C reaches the run and its children.
  const run = spawn(process.execPath, ["test", "./stray.test.ts"], {
    cwd: dir,
    detached: true,
    stdio: "ignore",
  });
  let ids: number[] = [];
  try {
    for (let i = 0; !existsSync(join(dir, "ids.txt")) && i < 100; i++)
      await Bun.sleep(100);
    for (let i = 0; ids.length < 2 && i < 10; i++) {
      ids = readFileSync(join(dir, "ids.txt"), "utf8")
        .split(" ")
        .map(Number)
        .filter(Boolean);
      await Bun.sleep(50);
    }
    expect(ids).toHaveLength(2);
    if (run.pid) stop?.(run.pid);
    for (let i = 0; ids.some(running) && i < 50; i++) await Bun.sleep(100);
    expect(ids.filter(running)).toEqual([]);
  } finally {
    for (const pid of run.pid ? [...ids, -run.pid] : ids)
      try {
        process.kill(pid, "SIGKILL");
      } catch {} // already gone
    rmSync(dir, { recursive: true, force: true });
  }
}, 20_000);
