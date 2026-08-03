// task-59 (P4) — the eval CLI. Thin shell by design: argv → runEvals → process.exit. All the
// testable logic lives in ./eval-runner (imported by the RED suite); this file only wires the
// runtime seams the tests inject as mocks — the REAL Anthropic provider (from ANTHROPIC_API_KEY),
// a v1 persona player that replays script.turns in order, and the eval-mode capture send.
// Refuses a non-local DB, exactly like scripts/seed.ts (S13.3/S11.5 — no prod eval writes here).
import { createPool, withOrg } from "@revenue-os/db";
import { createAnthropicProvider } from "@revenue-os/harness";
import {
  createCaptureSend,
  type EvalDeps,
  type PersonaPlayer,
  runEvals,
} from "./eval-runner";

/** --flag <value> / --flag=value; bare flags are ignored (we take only the ones we know). */
function argValue(flag: string): string | undefined {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(`--${flag}`);
  if (i !== -1 && i + 1 < argv.length) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${flag}=`));
  return eq ? eq.slice(flag.length + 3) : undefined;
}

/** v1 persona player: replay the scripted contact turns in order, then end the conversation. */
const scriptPlayer: PersonaPlayer = async (scenario, turnIndex) =>
  scenario.script.turns[turnIndex] ?? null;

async function main(): Promise<void> {
  const url =
    process.env.DATABASE_URL ||
    "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres";
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error("evals refuses to run against a non-local database");
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    throw new Error("evals needs ANTHROPIC_API_KEY to run the agent");

  const orgArg = argValue("org");
  const agentArg = argValue("agent");
  const scenarioArg = argValue("scenario");

  const pool = createPool(url);
  try {
    // Resolve the target org: an explicit id/slug, else the sole local org.
    const orgRow = orgArg
      ? await pool.query(
          "select id from orgs where id::text = $1 or slug = $1 limit 1",
          [orgArg],
        )
      : await pool.query("select id from orgs");
    if (orgArg && orgRow.rowCount === 0)
      throw new Error(`no org matches '${orgArg}'`);
    if (!orgArg && orgRow.rowCount !== 1)
      throw new Error(
        `expected exactly one local org (found ${orgRow.rowCount}); pass --org <id|slug>`,
      );
    const orgId = orgRow.rows[0].id as string;

    const summary = await withOrg(pool, orgId, async (tx) => {
      // Resolve the agent under test: --agent <key> (newest version) or the org's sole agent.
      const agentRow = agentArg
        ? await tx.query(
            "select id, model, system_prompt, tools_allowed from agents where key = $1 order by version desc limit 1",
            [agentArg],
          )
        : await tx.query(
            "select id, model, system_prompt, tools_allowed from agents",
          );
      if (agentArg && agentRow.rowCount === 0)
        throw new Error(`no agent matches '${agentArg}'`);
      if (!agentArg && agentRow.rowCount !== 1)
        throw new Error(
          `expected exactly one agent (found ${agentRow.rowCount}); pass --agent <key>`,
        );
      const agent = agentRow.rows[0] as {
        id: string;
        model: string;
        system_prompt: string;
        tools_allowed: string[] | null;
      };

      const deps: EvalDeps = {
        provider: createAnthropicProvider({ apiKey, model: agent.model }),
        player: scriptPlayer,
        send: createCaptureSend().send,
        agentId: agent.id,
        systemPrompt: agent.system_prompt,
        toolsAllowed: agent.tools_allowed ?? [],
      };
      return runEvals(
        deps,
        { orgId, db: tx },
        scenarioArg ? { scenario: scenarioArg } : undefined,
      );
    });

    console.log(summary.summary);
    process.exit(summary.exitCode);
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
