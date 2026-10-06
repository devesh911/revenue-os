// Child processes a test file starts, each in a process group of its own, so that stopping the group also stops
// whatever the child started. A child's group is stopped as soon as the child ends (its leftovers go at once, and the
// group's number is never signalled after the system may have handed it to another process), and every group still
// running is stopped when the file ends, however it ends: after its last test (bun stops a test past its time limit
// and that test's children, but not theirs), on Ctrl-C, SIGTERM or SIGHUP (the gate stops a file past its 10 minutes
// with SIGTERM), or when the run exits. Groups get SIGKILL: on 2026-10-04 whole-suite runs a stopped test left behind
// outlived SIGTERM for hours. Being groups of their own, the children miss a Ctrl-C at the terminal, so the run
// passes it on. Nothing can stop them if the run itself gets SIGKILL.
import { afterAll } from "bun:test";
import { spawn } from "node:child_process";

export function children() {
  const groups = new Set<number>();
  const stop = (group: number) => {
    try {
      process.kill(-group, "SIGKILL");
    } catch {} // already gone
    groups.delete(group);
  };
  const stopAll = () => {
    for (const g of groups) stop(g);
  };
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
  const unhook = () => {
    for (const s of signals) process.off(s, quit);
    process.off("exit", stopAll);
  };
  const quit = (s: NodeJS.Signals) => {
    stopAll();
    unhook();
    process.kill(process.pid, s); // then die of that signal, as without this handler
  };
  for (const s of signals) process.on(s, quit);
  process.on("exit", stopAll);
  afterAll(() => {
    stopAll();
    unhook();
  });
  return {
    /** Runs bun with `args` from `cwd`, as this run is configured; resolves to its exit code and output. */
    bun: (args: string[], cwd: string) =>
      new Promise<{ code: number | null; out: string }>((done) => {
        const child = spawn(process.execPath, args, { cwd, detached: true });
        const group = child.pid;
        if (group) groups.add(group);
        let out = "";
        child.stdout.on("data", (d) => {
          out += d;
        });
        child.stderr.on("data", (d) => {
          out += d;
        });
        // The group goes when the child ends ("exit"), not when its output closes ("close"): something the child
        // started may hold that output open, and "close" would wait for it.
        child.on("exit", () => {
          if (group) stop(group);
        });
        child.on("close", (code) => {
          if (group && groups.has(group)) stop(group);
          done({ code, out });
        });
      }),
  };
}
