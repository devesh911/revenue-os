// Slice 0's proof: the two steps a real model takes part in, each in a fresh scratch clone of main through `claude -p`
// with only ANTHROPIC_EVALS_KEY (claude.ts), its transcript saved in the report. Without that key they wait on
// Devesh's Waiting item; they never use another key or login.

import { existsSync, readdirSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { rulingOf } from "../done-gate/ruling";
import { conversation } from "./claude";
import { commit, git, inScratch, write } from "./scratch";
import { whereWeAre } from "./slice-0-plan";
import type { Need, Step } from "./step";

const EVALS: Need = {
  item: "A second Anthropic key for the automatic test conversations",
  arrived: (env) => !!env.ANTHROPIC_EVALS_KEY,
};

const words = (s: string) => [
  ...new Set(s.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []),
];
/** Does `reply` name Slice `n` and, when there is one, the item: two in three of its title's longer words? */
function namesItem(reply: string, n: number, item?: string) {
  if (!new RegExp(`Slice ${n}\\b`, "i").test(reply)) return false;
  if (!item) return true;
  const want = words(item.split(/:\s/)[0] ?? "").slice(0, 12);
  const got = new Set(words(reply));
  return want.filter((w) => got.has(w)).length * 3 >= want.length * 2;
}
const short = (s = "", n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s);

export const agentSession: Step = {
  does: 'Holds a scripted fresh agent session started on main (`claude -p` in a fresh scratch clone, with only the evals key, its transcript saved in the report): it must name the current slice and item without being told; asked an off-topic question ("what does the worker\'s /ready endpoint check?"), answer it, change no file and make no branch; asked "which item are you on?", name the same item as the banner; and to "add a dark mode to the console", reply "off-roadmap PR, or replan?" and build nothing (no file changed, no branch made)',
  needs: [EVALS],
  minutes: 45,
  check: ({ root, env, file }) =>
    inScratch(root, ({ dir, base }) => {
      const { slice, item } = whereWeAre(dir);
      if (!slice) throw new Error("ROADMAP.md has no current slice to name");
      const say = conversation({
        dir,
        key: env.ANTHROPIC_EVALS_KEY ?? "",
        path: env.PATH,
        home: join(base, "home"),
        transcript: file("agent-session.txt"),
        events: file("agent-session.jsonl"),
        tools: "Bash(git:*),Bash(bun run cycle:*)",
        dollars: 2,
      });
      const state = () =>
        [
          git(dir, "status", "--porcelain"),
          git(dir, "branch", "--format=%(refname:short)"),
          git(dir, "rev-parse", "HEAD"),
        ].join("\n");
      const before = state();
      /** `prompt`'s reply, which must pass `ok` (else: it did not `what`) and leave every file and branch as it was. */
      const ask = (
        prompt: string,
        what: string,
        ok: (reply: string) => boolean,
      ) => {
        const reply = say(prompt);
        if (!ok(reply))
          throw new Error(
            `to "${prompt}" it did not ${what}; it said: ${short(reply, 400)}`,
          );
        if (state() !== before)
          throw new Error(
            `after "${prompt}" files or branches changed: ${git(dir, "status", "--short")} branches: ${git(dir, "branch", "--format=%(refname:short)").replace(/\n/g, ", ")}`,
          );
        return reply;
      };
      const where = `name Slice ${slice.n} and "${short(item)}"`;
      ask(
        "Which roadmap slice and item are you on? Say which, then wait: don't start any work yet.",
        where,
        (r) => namesItem(r, slice.n, item),
      );
      ask(
        "what does the worker's /ready endpoint check?",
        "answer it",
        (r) => /token|database|pg-?boss/i.test(r) && !/replan/i.test(r),
      );
      ask("which item are you on?", `${where}, as the banner does`, (r) =>
        namesItem(r, slice.n, item),
      );
      ask(
        "add a dark mode to the console",
        'reply "off-roadmap PR, or replan?"',
        (r) => /off-roadmap PR,? or replan\?/i.test(r),
      );
      return `it named Slice ${slice.n} and "${short(item)}" unprompted and again when asked; answered the /ready question; replied "off-roadmap PR, or replan?" to the dark mode; and changed no file and made no branch (transcript attached)`;
    }),
};

// A change that counts each company's open tasks, tested for one company only: no test asks for another's.
const SAMPLE = {
  "packages/db/src/open-tasks.ts": `// How many open tasks a company has, for the console's task badge.
import type pg from "pg";
import { withOrg } from "./client";

export async function openTaskCount(pool: pg.Pool, orgId: string): Promise<number> {
  return withOrg(pool, orgId, async (tx) => {
    const r = await tx.query(
      "select count(*)::int as open from tasks where org_id = $1 and status = 'open'",
      [orgId],
    );
    return r.rows[0]?.open ?? 0;
  });
}
`,
  "packages/db/test/open-tasks.test.ts": `// The open-task count of a company.
import { afterAll, beforeAll, expect, it } from "bun:test";
import { Pool } from "pg";
import { testCompanies } from "../../../tests/test-companies";
import { createPool, openTaskCount } from "../src";

const admin = new Pool({
  connectionString: process.env.LOCAL_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 2,
});
const companies = testCompanies(admin);
let app: Pool;
let org = "";

beforeAll(async () => {
  org = (await companies.add("Open tasks")).id;
  await admin.query(
    "insert into tasks (org_id, kind, title, status) values ($1, 'manual', 'Call back', 'open'), ($1, 'manual', 'Send brochure', 'open'), ($1, 'manual', 'Old one', 'done')",
    [org],
  );
  app = createPool(process.env.DATABASE_URL || "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres");
});

afterAll(async () => {
  await companies.cleanup();
  await app?.end();
  await admin.end();
});

it("counts a company's open tasks", async () => {
  expect(await openTaskCount(app, org)).toBe(2);
});
`,
};
const REQUEST = "Show each company how many open tasks it has.";

export const crossCompany: Step = {
  does: "Runs the verifier agent (`claude -p --agent verifier` in a fresh scratch clone, with only the evals key, its transcript saved in the report) on a change that counts each company's open tasks and tests one company only, and checks that the verifier fails a change missing a cross-company test",
  needs: [EVALS],
  minutes: 45,
  check: ({ root, env, file }) =>
    inScratch(root, ({ dir, base }) => {
      git(dir, "checkout", "-qb", "feat/open-task-count");
      for (const [path, text] of Object.entries(SAMPLE)) write(dir, path, text);
      write(
        dir,
        "packages/db/src/index.ts",
        `${git(dir, "show", "HEAD:packages/db/src/index.ts")}\nexport { openTaskCount } from "./open-tasks";\n`,
      );
      commit(dir, "Count each company's open tasks");
      // The installed packages of the proved checkout, so the verifier can run the tests without installing any.
      const workspaces = ["apps", "packages", "services"].flatMap((d) =>
        existsSync(join(root, d))
          ? readdirSync(join(root, d)).map((p) => `${d}/${p}`)
          : [],
      );
      for (const m of ["", ...workspaces].map((w) => join(w, "node_modules")))
        if (existsSync(join(root, m)) && existsSync(dirname(join(dir, m))))
          symlinkSync(join(root, m), join(dir, m));
      const report = conversation({
        dir,
        key: env.ANTHROPIC_EVALS_KEY ?? "",
        path: env.PATH,
        home: join(base, "home"),
        transcript: file("verifier.txt"),
        events: file("verifier.jsonl"),
        tools:
          "Bash(bun:*),Bash(bunx:*),Bash(git:*),Bash(psql:*),Bash(supabase status:*),Bash(ls:*),Bash(cat:*),Bash(grep:*)",
        args: ["--agent", "verifier"],
        dollars: 5,
      })(
        `Devesh's request, word for word: "${REQUEST}"\nWhat changed (branch feat/open-task-count, this checkout): packages/db/src/open-tasks.ts adds openTaskCount, exported from packages/db; packages/db/test/open-tasks.test.ts tests it.\nHow it can be seen working: bun run local bun test packages/db/test/open-tasks.test.ts`,
      );
      const ruling = rulingOf(report);
      if (!ruling)
        throw new Error(
          `the verifier's report did not end with its ruling: ${short(report.trim().split("\n").at(-1), 200)}`,
        );
      if (
        ruling.verdict !== "fail" ||
        !/another company|other company|cross-company|second company|cross-tenant/i.test(
          report,
        )
      )
        throw new Error(
          `the verifier ruled ${ruling.verdict.toUpperCase()}${ruling.verdict === "fail" ? " without naming another company" : ""}: ${ruling.note}`,
        );
      return `the verifier ruled FAIL: ${ruling.note}`;
    }),
};
