// Child processes a test file starts.
import { spawn } from "node:child_process";

export function children() {
  return {
    /** Runs bun with `args` from `cwd`, as this run is configured; resolves to its exit code and output. */
    bun: (args: string[], cwd: string) =>
      new Promise<{ code: number | null; out: string }>((done) => {
        const child = spawn(process.execPath, args, { cwd });
        let out = "";
        child.stdout.on("data", (d) => {
          out += d;
        });
        child.stderr.on("data", (d) => {
          out += d;
        });
        child.on("close", (code) => done({ code, out }));
      }),
  };
}
