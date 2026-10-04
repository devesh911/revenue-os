// A test file that starts children through tests/children.ts leaves none of them, and nothing they started,
// running once it ends, however it ends. On 2026-10-04 the whole-suite runs that
// services/worker/test/test-runs-at-once.test.ts starts outlived it for hours and loaded the machine until later
// gate runs timed out: bun's own time limit stops a test's children but not theirs, and a test run stopped from
// outside (the gate stops one file past its 10 minutes with SIGTERM) stops none of them.
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

/** A child that starts a grandchild, writes both their ids to ids.txt, then sleeps or ends at once. */
const child = (sleeps: boolean) =>
  `const g = require("node:child_process").spawn("sleep", ["30"], { stdio: "ignore" });
   g.unref();
   require("node:fs").writeFileSync("ids.txt", process.pid + " " + g.pid);
   ${sleeps ? "setTimeout(() => {}, 30_000);" : ""}`;

it.each([
  {
    ends: "it passes, its child done but the grandchild still running",
    sleeps: false,
    limit: 10_000,
  },
  { ends: "it runs past its time limit", sleeps: true, limit: 1_000 },
  {
    ends: "the run is stopped with SIGTERM, as the gate stops a file past its 10 minutes",
    sleeps: true,
    limit: 60_000,
    stop: (run: number) => process.kill(run, "SIGTERM"),
  },
  {
    ends: "Ctrl-C at the terminal (SIGINT to the run's process group)",
    sleeps: true,
    limit: 60_000,
    stop: (run: number) => process.kill(-run, "SIGINT"),
  },
])("children and grandchildren are gone once a test ends: $ends", async ({
  sleeps,
  limit,
  stop,
}) => {
  const dir = mkdtempSync(join(tmpdir(), "children-"));
  writeFileSync(
    join(dir, "stray.test.ts"),
    `import { it } from "bun:test";
import { children } from ${JSON.stringify(helper)};
const { bun } = children();
it("starts a child", async () => {
  await bun(["-e", ${JSON.stringify(child(sleeps))}], import.meta.dir);
}, ${limit});
`,
  );
  // In a group of its own, as a test run started at a terminal is, so Ctrl-C reaches the run and its children.
  const run = spawn(process.execPath, ["test", "./stray.test.ts"], {
    cwd: dir,
    detached: true,
    stdio: "ignore",
  });
  const ended = new Promise((done) => run.on("exit", done));
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
    await ended;
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
