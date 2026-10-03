// Slice 0's proof: what main's copy of the rules refuses. Each case is a scratch branch in a clone of the proved
// commit, judged from main's checkout as data, as rules-from-main judges a pull request (`bun scripts/done-gate.ts pr
// --base main --head <branch>`, with a sample body and 9999 as its number) or as CI's done rules do (`… rules`). No
// pull request is opened: one opened from a GitHub workflow starts no other workflows. Where a refusal could be for
// another reason, the same change, put right, must pass.

import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { areasOf, TABLE } from "../done-gate/fix-when-touched";
import { judged, PR, rules } from "./gate";
import { commit, git, inScratch, sh, write } from "./scratch";
import type { Step } from "./step";

const FIRST =
  "Roadmap: off-roadmap — a sample pull request the Slice 0 proof judges and throws away";
const WHY = "a sample change the proof makes and throws away";
// Product code that switches the type checker off: a problem whichever copy of the rules finds it.
const SAMPLE = "services/worker/src/proof-sample.ts";
const UNCHECKED = '// @ts-ignore\nconst sample: number = "one";\n'; // done-gate: allow the sample written into a scratch branch, for main's copy of the rules to refuse

/** On a new branch `name` cut from main: `change`, committed; then back to main. */
function branch(dir: string, name: string, change: () => void) {
  git(dir, "checkout", "-q", "-B", name, "main");
  change();
  commit(dir, `a sample: ${name}`);
  git(dir, "checkout", "-q", "main");
}

/** A sample body: its first line, a `Rule change:` line per rule, and an answer to each entry of main's table. */
function body(
  dir: string,
  o: { rules?: string[]; answered?: boolean; first?: string } = {},
) {
  const entries =
    o.answered === false
      ? []
      : areasOf(git(dir, "show", `main:${TABLE}`)).map((e) => e.n);
  return [
    o.first ?? FIRST,
    "",
    ...(o.rules ?? []).map((r) => `Rule change: ${r} · looser · ${WHY}`),
    ...entries.map((n) => `Fix-when-touched: ${n} · not applicable · ${WHY}`),
    "",
  ].join("\n");
}

/** Adds this pull request's line for `rule` to STATE.md → Rule changes, above the newest. */
function record(dir: string, rule: string) {
  const file = join(dir, "STATE.md");
  const lines = readFileSync(file, "utf8").split("\n");
  const at = lines.indexOf("## Rule changes");
  if (at < 0) throw new Error("STATE.md has no Rule changes section");
  const next = lines.findIndex(
    (l, i) => i > at && (l.startsWith("- ") || l.startsWith("## ")),
  );
  lines.splice(
    next < 0 ? lines.length : next,
    0,
    `- ${new Date().toISOString().slice(0, 10)} · [#${PR}](https://github.com/devesh911/revenue-os/pull/${PR}) · ${rule} · looser`,
  );
  writeFileSync(file, lines.join("\n"));
}

type Run = { status: number; out: string };
const lead = (r: Run) => r.out.trim().split("\n").slice(0, 3).join(" / ");

/** The first problem `who` named, when it refused with each of `needles` in what it said; else why not. */
function refused(who: string, r: Run, ...needles: string[]) {
  const missing = needles.filter((n) => !r.out.includes(n));
  if (r.status === 1 && !missing.length)
    return (
      r.out
        .split("\n")
        .find((l) => l.startsWith("- "))
        ?.slice(2) ?? lead(r)
    );
  throw new Error(
    r.status === 0
      ? `${who} passed it: ${lead(r)}`
      : `${who} exited ${r.status} without naming ${missing.join(" and ")}: ${lead(r)}`,
  );
}

const MAIN = "main's copy of the rules";
function passes(r: Run, what: string) {
  if (r.status !== 0)
    throw new Error(
      `${MAIN} also refused ${what}, so the refusal may not be for its reason: ${lead(r)}`,
    );
}

export const unexplainedRuleChange: Step = {
  does: "Judges with main's copy of `rules-from-main` (`--head <scratch branch>` and a sample PR body) a rule-file change to AGENTS.md whose body doesn't explain it or that adds no line to STATE.md → Rule changes, and checks that each is refused and the same change, explained and recorded, passes",
  check: ({ root }) =>
    inScratch(root, ({ dir }) => {
      const change = () =>
        appendFileSync(join(dir, "AGENTS.md"), `\nA sample rule: ${WHY}.\n`);
      branch(dir, "recorded", () => {
        change();
        record(dir, "AGENTS.md");
      });
      branch(dir, "unrecorded", change);
      const said = { rules: ["AGENTS.md"] };
      const a = refused(MAIN, judged(dir, body(dir), "recorded"), "AGENTS.md");
      const b = refused(
        MAIN,
        judged(dir, body(dir, said), "unrecorded"),
        "AGENTS.md",
        "Rule changes",
      );
      passes(
        judged(dir, body(dir, said), "recorded"),
        "the change explained and recorded",
      );
      return `refused the unexplained one (${a}) and the unrecorded one (${b}); passed it explained and recorded`;
    }),
};

export const loosenedGate: Step = {
  does: `Judges with main's copy of \`rules-from-main\` a branch that loosens its own copy of the gate (its scripts/done-gate.ts passes anything) and adds product code that switches the type checker off (${SAMPLE}), explained and recorded, and checks that main's copy refuses it while the branch's own copy passes it`,
  check: ({ root }) =>
    inScratch(root, ({ dir }) => {
      branch(dir, "loosened", () => {
        write(
          dir,
          "scripts/done-gate.ts",
          "process.exit(0); // passes anything\n",
        );
        write(dir, SAMPLE, UNCHECKED);
        record(dir, "scripts/done-gate.ts");
      });
      git(dir, "checkout", "-q", "loosened");
      const own = sh(dir, [
        "bun",
        "scripts/done-gate.ts",
        "rules",
        "--base",
        "main",
      ]);
      git(dir, "checkout", "-q", "main");
      if (own.status !== 0)
        throw new Error(
          `the branch's own copy refused it too, so this shows nothing: ${lead(own)}`,
        );
      const why = refused(
        MAIN,
        judged(dir, body(dir, { rules: ["scripts/done-gate.ts"] }), "loosened"),
        SAMPLE,
      );
      return `the branch's own copy passed it; main's copy refused it: ${why}`;
    }),
};

export const rewrittenCi: Step = {
  does: `Judges with main's copy of \`rules-from-main\` a branch that rewrites ci.yml so its \`checks\` job checks nothing and adds product code that switches the type checker off (${SAMPLE}), explained and recorded, and checks that main's copy refuses it`,
  check: ({ root }) =>
    inScratch(root, ({ dir }) => {
      branch(dir, "rewritten-ci", () => {
        write(
          dir,
          ".github/workflows/ci.yml",
          "name: ci\non: [push, pull_request]\npermissions:\n  contents: read\njobs:\n  checks:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo nothing is checked\n",
        );
        write(dir, SAMPLE, UNCHECKED);
        record(dir, ".github/workflows/ci.yml");
      });
      const why = refused(
        MAIN,
        judged(
          dir,
          body(dir, { rules: [".github/workflows/ci.yml"] }),
          "rewritten-ci",
        ),
        SAMPLE,
      );
      return `main's copy refused it, whatever the branch's ci.yml runs: ${why}`;
    }),
};

export const noFirstLine: Step = {
  does: 'Judges with main\'s copy of `rules-from-main` a PR body without its roadmap first line (it starts "## What"), and checks that it is refused and the same pull request with its first line passes',
  check: ({ root }) =>
    inScratch(root, ({ dir }) => {
      branch(dir, "notes", () =>
        write(dir, "docs/proof-sample.md", `${WHY}\n`),
      );
      const why = refused(
        MAIN,
        judged(dir, body(dir, { first: "## What" }), "notes"),
        "first line",
      );
      passes(judged(dir, body(dir), "notes"), "it with its first line");
      return `refused it: ${why}; passed it with "${FIRST}"`;
    }),
};

export const fixWhenTouchedUnanswered: Step = {
  does: "Judges with main's copy of `rules-from-main` a change that touches a fix-when-touched area (a folder of the first entry of docs/fix-when-touched.md that names one) whose body doesn't name the entry, and checks that it is refused and passes once the body answers it",
  check: ({ root }) =>
    inScratch(root, ({ dir }) => {
      const entry = areasOf(git(dir, "show", `main:${TABLE}`)).find((e) =>
        e.paths.some((p) => p.endsWith("/")),
      );
      const folder = entry?.paths.find((p) => p.endsWith("/"));
      if (!entry || !folder)
        throw new Error(`${TABLE} on main has no entry naming a folder`);
      branch(dir, "unanswered", () =>
        write(dir, `${folder}proof-sample.md`, `${WHY}\n`),
      );
      const why = refused(
        MAIN,
        judged(dir, body(dir, { answered: false }), "unanswered"),
        `entry ${entry.n}`,
      );
      passes(
        judged(dir, body(dir), "unanswered"),
        "it with the entry answered",
      );
      return `refused a change to ${folder}proof-sample.md: ${why}; passed it answered`;
    }),
};

export const editedMigration: Step = {
  does: "Runs CI's migration check the same way (main's copy, `--head <scratch branch>`) on a scratch branch that edits a migration already on main, and checks that it fails",
  check: ({ root }) =>
    inScratch(root, ({ dir }) => {
      const migration = git(dir, "ls-files", "supabase/migrations/*.sql").split(
        "\n",
      )[0];
      if (!migration) throw new Error("main has no migration to edit");
      branch(dir, "edited-migration", () =>
        appendFileSync(join(dir, migration), `\n-- ${WHY}\n`),
      );
      return `it failed: ${refused(MAIN, judged(dir, body(dir), "edited-migration"), migration)}`;
    }),
};

const RULES = "the done rules";

export const deletedTest: Step = {
  does: "Runs the done rules (`bun scripts/done-gate.ts rules --head <scratch branch>`, as CI and every stop run them) on a deleted test (a scratch branch deletes a worker test file) with no line in docs/removed-tests.md, and checks that it is refused",
  check: ({ root }) =>
    inScratch(root, ({ dir }) => {
      const test = git(dir, "ls-files", "services/worker/test/*.test.ts").split(
        "\n",
      )[0];
      if (!test) throw new Error("main has no worker test file to delete");
      branch(dir, "deleted-test", () => rmSync(join(dir, test)));
      return `refused: ${refused(RULES, rules(dir, "deleted-test"), "docs/removed-tests.md", test)}`;
    }),
};

export const barrelExport: Step = {
  does: "Runs the done rules on a scratch branch that adds an export only a barrel file re-exports (packages/shared/src/index.ts passes on `proofSample`, which nothing imports), and checks that it is refused",
  check: ({ root }) =>
    inScratch(root, ({ dir }) => {
      const barrel = "packages/shared/src/index.ts";
      branch(dir, "barrel-export", () => {
        write(
          dir,
          "packages/shared/src/proof-sample.ts",
          `// ${WHY}: nothing imports it.\nexport function proofSample() {\n  return 1;\n}\n`,
        );
        appendFileSync(
          join(dir, barrel),
          'export { proofSample } from "./proof-sample";\n',
        );
      });
      return `refused: ${refused(RULES, rules(dir, "barrel-export"), "proofSample")}`;
    }),
};
