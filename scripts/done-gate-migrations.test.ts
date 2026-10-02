// Migrations on main never change (AGENTS.md hard rail 4): main's copy of the gate (`bun run gate pr`, which the
// required rules-from-main check runs) refuses a branch that edits, renames or deletes a migration main already
// has, or gives a new one a number another migration has. Each case runs the gate as the Slice 0 proof does: from
// main's checkout, judging a scratch branch as data with `--head`.
import { afterAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

setDefaultTimeout(30_000); // each case starts git and bun several times
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const sh = (dir: string, cmd: string[], env: Record<string, string> = {}) =>
  spawnSync(cmd[0] as string, cmd.slice(1), {
    cwd: dir,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
const write = (dir: string, file: string, body: string) => {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), body);
};
const commit = (dir: string) => {
  sh(dir, ["git", "add", "-A"]);
  sh(dir, [
    "git",
    "-c",
    "user.email=t@t",
    "-c",
    "user.name=t",
    "commit",
    "-qm",
    "x",
  ]);
};

const M = "supabase/migrations";
/** A scratch repo whose main holds a copy of the gate and two migrations, with a branch `feat` cut from it. */
function project() {
  const dir = mkdtempSync(join(tmpdir(), "done-gate-migrations-"));
  dirs.push(dir);
  mkdirSync(join(dir, "scripts"));
  copyFileSync(
    join(import.meta.dir, "done-gate.ts"),
    join(dir, "scripts", "done-gate.ts"),
  );
  cpSync(
    join(import.meta.dir, "done-gate"),
    join(dir, "scripts", "done-gate"),
    { recursive: true },
  );
  write(dir, "STATE.md", "# State\n");
  write(dir, `${M}/001_contacts.sql`, "create table contacts (id int);\n");
  write(dir, `${M}/002_calls.sql`, "create table calls (id int);\n");
  write(dir, `${M}/README.md`, "How migrations are written.\n");
  sh(dir, ["git", "init", "-q", "-b", "main"]);
  commit(dir);
  sh(dir, ["git", "checkout", "-qb", "feat"]);
  return dir;
}
const BODY = "Roadmap: Slice 0 — x\n";
/** Commit the branch, go back to main, and judge the branch from main's checkout as data. */
const judged = (dir: string) => {
  commit(dir);
  sh(dir, ["git", "checkout", "-q", "main"]);
  const r = sh(
    dir,
    ["bun", "scripts/done-gate.ts", "pr", "--base", "main", "--head", "feat"],
    {
      PR_BODY: BODY,
      PR_NUMBER: "7",
    },
  );
  return { status: r.status, out: r.stdout + r.stderr };
};
const ON_MAIN = (file: string, how: string) =>
  `${M}/${file} is already on main, and this change ${how} it: a migration on main never changes`;

describe("bun run gate pr: a migration already on main never changes, and no two share a number", () => {
  it("refuses a branch that edits a migration already on main, even by only adding a line", () => {
    const dir = project();
    write(dir, `${M}/001_contacts.sql`, "create table contacts (id bigint);\n");
    const r = judged(dir);
    expect(r.out).toContain(ON_MAIN("001_contacts.sql", "edits"));
    expect(r.status).toBe(1);
    sh(dir, ["git", "checkout", "-q", "feat"]);
    sh(dir, ["git", "checkout", "-q", "main", "--", M]);
    write(
      dir,
      `${M}/002_calls.sql`,
      "create table calls (id int);\nalter table calls add note text;\n",
    );
    const appended = judged(dir);
    expect(appended.out).toContain(ON_MAIN("002_calls.sql", "edits"));
    expect(appended.out).not.toContain("001_contacts.sql");
    expect(appended.status).toBe(1);
  });

  it("refuses a branch that deletes or renames a migration already on main", () => {
    const dir = project();
    rmSync(join(dir, M, "001_contacts.sql"));
    sh(dir, ["git", "mv", `${M}/002_calls.sql`, `${M}/003_calls.sql`]);
    const r = judged(dir);
    expect(r.out).toContain(ON_MAIN("001_contacts.sql", "deletes or renames"));
    expect(r.out).toContain(ON_MAIN("002_calls.sql", "deletes or renames"));
    expect(r.status).toBe(1);
  });

  it("refuses a migration on main turned into a link to other SQL", () => {
    const dir = project();
    write(dir, "other.sql", "drop table contacts;\n");
    rmSync(join(dir, M, "001_contacts.sql"));
    symlinkSync("../../other.sql", join(dir, M, "001_contacts.sql"));
    const r = judged(dir);
    expect(r.out).toContain(ON_MAIN("001_contacts.sql", "edits"));
    expect(r.status).toBe(1);
  });

  it("refuses a new migration that reuses a number, whether main's or another new one's", () => {
    const dir = project();
    write(dir, `${M}/002_notes.sql`, "create table notes (id int);\n");
    write(dir, `${M}/003_tasks.sql`, "create table tasks (id int);\n");
    write(dir, `${M}/003_tags.sql`, "create table tags (id int);\n");
    const r = judged(dir);
    expect(r.out).toContain(
      `${M}/002_notes.sql reuses migration number 002, which ${M}/002_calls.sql already has`,
    );
    expect(r.out).toContain(
      `${M}/003_tags.sql reuses migration number 003, which ${M}/003_tasks.sql already has`,
    );
    expect(r.out).toContain(
      `${M}/003_tasks.sql reuses migration number 003, which ${M}/003_tags.sql already has`,
    );
    expect(r.status).toBe(1);
  });

  it("passes a new migration with a fresh number, and an edit to the migrations folder's README", () => {
    const dir = project();
    write(dir, `${M}/003_tasks.sql`, "create table tasks (id int);\n");
    write(
      dir,
      `${M}/README.md`,
      "How migrations are written, and never edited.\n",
    );
    expect(judged(dir)).toEqual({
      status: 0,
      out: "Pull request ✓ nothing in the change in feat since main breaks the done rules, and every rule change is explained and recorded\n",
    });
  });

  it("runs locally on the worktree too, before anything is committed", () => {
    const dir = project();
    write(dir, `${M}/001_contacts.sql`, "create table contacts (id bigint);\n");
    const r = sh(dir, ["bun", "scripts/done-gate.ts", "pr", "--base", "main"], {
      PR_BODY: BODY,
    });
    expect(r.stdout).toContain(ON_MAIN("001_contacts.sql", "edits"));
    expect(r.status).toBe(1);
  });
});
