// biome-ignore-all lint/suspicious/noThenProperty: `then` is a workflow step FIELD (data, not a
// thenable) in the T26.2 definition JSON — this file reads step.then to resolve step references.
// H9 (hole audit, Package 2 / task-58) — RED spec: the SHIPPED seed workflows must satisfy the
// engine's OWN definition schema. Env-free: reads the seed SQL text from disk, no DB, no network.
//
// DEFECT (ground truth, read directly, main@4a3b3fe):
//   • supabase/seeds/real_estate.sql:63-71 and supabase/seeds/b2b_wholesale.sql:56-63 store a
//     `definition` jsonb in a dialect WorkflowDefinitionSchema REJECTS: no `entry` key (required),
//     `steps` as an ARRAY of {id, kind} objects instead of a keyed record, and step kinds
//     `conversation` / `send` / `handoff` / `task` that are not in the closed union at
//     packages/harness/src/workflow/schema.ts:92-121 (call | wait | wait_until | whatsapp |
//     branch | tool | end). `wait` uses duration/on/until instead of for/then.
//   • services/worker/src/runs.ts:38 calls WorkflowDefinitionSchema.parse(wfRow.definition), so
//     `bun run db:seed <pack>` → startRun throws a ZodError and NO run is created; even if a run
//     existed, services/worker/src/scheduler.ts:138 re-parses in phase 1 and dead-letters it.
//   • Why nothing caught it: every existing test AUTHORS its own correct-dialect definition
//     (packages/harness/test/interpret.test.ts:43, services/worker/test/scheduler.test.ts:109),
//     so the shipped JSON and the schema have never met in CI.
//
// PINNED here:
//   1. every workflow definition that ships in supabase/seeds/*.sql parses against
//      WorkflowDefinitionSchema (per-workflow failure output names file + workflow key);
//   2. every step id a seeded definition references (entry, then, on.*, onDisposition.*)
//      resolves to a step in the SAME definition — a definition that parses but dangles is
//      dead-lettered at the first tick (scheduler.ts:140-148), i.e. still broken;
//   3. interpreting a seeded definition from its entry step does not throw.
//
// NOT PINNED (deliberately): the CONTENT of the flows — which steps, which templates, which
//   waits, how many workflows a pack ships, the pack names. The fix edits the SEEDS, not the
//   schema's closed set; if a seed definition parses and its refs resolve, this suite is green.
import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { interpret } from "../src/workflow/interpret";
import {
  type WorkflowDefinition,
  WorkflowDefinitionSchema,
} from "../src/workflow/schema";

const SEED_DIR = join(import.meta.dir, "..", "..", "..", "supabase", "seeds");

type SeededWorkflow = {
  /** "<file>:<key>" — the label every per-workflow assertion is reported under. */
  name: string;
  file: string;
  key: string;
  /** The raw jsonb literal, JSON.parsed — exactly what the seed INSERTs. */
  definition: unknown;
};

/** Every `insert into workflows … values (…)` statement in a seed file, quote-aware so a
 *  semicolon inside a JSON literal cannot truncate the statement. */
function workflowStatements(sql: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = sql.indexOf("insert into workflows", from);
    if (start < 0) return out;
    let i = start;
    let inString = false;
    for (; i < sql.length; i++) {
      const c = sql[i];
      if (c === "'") {
        if (inString && sql[i + 1] === "'") {
          i++; // '' is an escaped quote inside a SQL string literal
          continue;
        }
        inString = !inString;
      } else if (c === ";" && !inString) {
        break;
      }
    }
    out.push(sql.slice(start, i));
    from = i;
  }
}

// One VALUES tuple: … 'key', <version>, 'status', '<definition json>')
const TUPLE =
  /'([a-z0-9_]+)'\s*,\s*\d+\s*,\s*'(?:draft|active|archived)'\s*,\s*'(\{[\s\S]*?\})'\s*\)/g;

/** The definitions that actually SHIP — parsed out of the seed SQL text, never restated here. */
function seededWorkflows(): { files: string[]; workflows: SeededWorkflow[] } {
  const files = readdirSync(SEED_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const workflows: SeededWorkflow[] = [];
  for (const file of files) {
    const sql = readFileSync(join(SEED_DIR, file), "utf8");
    for (const stmt of workflowStatements(sql)) {
      TUPLE.lastIndex = 0;
      for (let m = TUPLE.exec(stmt); m; m = TUPLE.exec(stmt)) {
        const key = m[1] as string;
        const literal = (m[2] as string).replace(/''/g, "'");
        workflows.push({
          name: `${file}:${key}`,
          file,
          key,
          definition: JSON.parse(literal),
        });
      }
    }
  }
  return { files, workflows };
}

/** Step ids a step routes to: `then`, and the values of `on` / `onDisposition`. */
function referencedSteps(step: Record<string, unknown>): string[] {
  const refs: string[] = [];
  if (typeof step.then === "string") refs.push(step.then);
  for (const key of ["on", "onDisposition"]) {
    const map = step[key];
    if (map && typeof map === "object") {
      for (const target of Object.values(map as Record<string, unknown>)) {
        if (typeof target === "string") refs.push(target);
      }
    }
  }
  return refs;
}

const { files, workflows } = seededWorkflows();

describe("shipped seed workflow definitions (H9)", () => {
  it("the extractor actually found the shipped definitions (non-vacuity guard)", () => {
    // If this suite ever passes because it validated NOTHING, that is the bug — pin the floor.
    expect(files.length).toBeGreaterThan(0); // supabase/seeds/*.sql exists
    expect(workflows.length).toBeGreaterThan(0); // …and carries workflow definitions
    // every seed file that INSERTs a workflow must have yielded at least one definition
    const insertingFiles = files.filter((f) =>
      readFileSync(join(SEED_DIR, f), "utf8").includes("insert into workflows"),
    );
    const extractedFrom = new Set(workflows.map((w) => w.file));
    expect([...extractedFrom].sort()).toEqual(insertingFiles.sort());
  });

  it("every seeded definition parses against WorkflowDefinitionSchema", () => {
    // The engine's own validator is the gate: runs.ts:38 and scheduler.ts:138 both parse it.
    const results = workflows.map((w) => {
      const parsed = WorkflowDefinitionSchema.safeParse(w.definition);
      return {
        workflow: w.name,
        parses: parsed.success,
        issues: parsed.success
          ? []
          : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      };
    });
    expect(results).toEqual(
      workflows.map((w) => ({ workflow: w.name, parses: true, issues: [] })),
    );
  });

  it("every step id a seeded definition references resolves inside that definition", () => {
    // A definition that PARSES but routes to a missing step throws 'unknown step' in the
    // interpreter and is dead-lettered on the first tick — parseable is necessary, not sufficient.
    const dangling = workflows.map((w) => {
      const parsed = WorkflowDefinitionSchema.safeParse(w.definition);
      if (!parsed.success) {
        return {
          workflow: w.name,
          unresolved: ["<definition does not parse>"],
        };
      }
      const def = parsed.data as WorkflowDefinition;
      const ids = new Set(Object.keys(def.steps));
      const unresolved: string[] = [];
      if (!ids.has(def.entry)) unresolved.push(`entry -> ${def.entry}`);
      for (const [id, step] of Object.entries(def.steps)) {
        for (const ref of referencedSteps(step as Record<string, unknown>)) {
          if (!ids.has(ref)) unresolved.push(`${id} -> ${ref}`);
        }
      }
      return { workflow: w.name, unresolved };
    });
    expect(dangling).toEqual(
      workflows.map((w) => ({ workflow: w.name, unresolved: [] })),
    );
  });

  it("the interpreter walks each seeded definition from its entry step without throwing", () => {
    const now = new Date("2026-08-01T04:00:00.000Z");
    let walked = 0;
    const failures: { workflow: string; error: string }[] = [];
    for (const w of workflows) {
      const parsed = WorkflowDefinitionSchema.safeParse(w.definition);
      if (!parsed.success) continue; // reported by the parse test above
      try {
        interpret(
          parsed.data as WorkflowDefinition,
          { contactId: "00000000-0000-4000-8000-000000000001" },
          { type: "wake" },
          now,
        );
        walked += 1;
      } catch (err) {
        failures.push({
          workflow: w.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    expect(failures).toEqual([]);
    expect(walked).toBe(workflows.length); // non-vacuous: every seeded flow was actually walked
  });
});
