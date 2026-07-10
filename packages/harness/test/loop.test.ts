// Task 7 acceptance (project-spec §12): the loop runs a scripted tool call — fake LLM,
// real DB rows (T26.5: "stateless turn: crash-safe by construction; all effects are rows").
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createPool, withOrg } from "@revenue-os/db";
import pg from "pg";
import { z } from "zod";
import { runTurn } from "../src/loop";
import { ToolRegistry } from "../src/registry";
import type { LlmProvider, LlmTurn, OrgCtx } from "../src/types";

const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 2,
});
const appService = createPool(
  process.env.DATABASE_URL ||
    "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres",
);

let orgId = "";
let contactId = "";
let conversationId = "";

// usage_events + audit_log deliberately have NO cascade (append-only forever) — test
// cleanup must clear them before the org can go.
async function cleanup() {
  await admin.query(
    `delete from usage_events where org_id in (select id from orgs where slug = 'harness-test')`,
  );
  await admin.query(
    `delete from audit_log where org_id in (select id from orgs where slug = 'harness-test')`,
  );
  await admin.query(`delete from orgs where slug = 'harness-test'`);
}

beforeAll(async () => {
  await cleanup();
  const org = await admin.query(
    `insert into orgs (name, slug) values ('Harness Org', 'harness-test') returning id`,
  );
  orgId = org.rows[0].id;
  const contact = await admin.query(
    `insert into contacts (org_id, first_name) values ($1, 'Before') returning id`,
    [orgId],
  );
  contactId = contact.rows[0].id;
  const convo = await admin.query(
    `insert into conversations (org_id, contact_id, channel, direction, status)
		 values ($1, $2, 'whatsapp', 'outbound', 'active') returning id`,
    [orgId, contactId],
  );
  conversationId = convo.rows[0].id;
  await admin.query(
    `insert into messages (org_id, conversation_id, seq, role, content)
		 values ($1, $2, 1, 'contact', 'hello — my name is Scripted')`,
    [orgId, conversationId],
  );
});

afterAll(async () => {
  await cleanup();
  await appService.end();
  await admin.end();
});

/** Scripted fake provider: first turn calls a tool, second turn closes with text. */
function fakeLlm(turns: LlmTurn[]): LlmProvider {
  let i = 0;
  return {
    complete: async () => {
      const turn = turns[Math.min(i, turns.length - 1)];
      i += 1;
      return turn;
    },
  };
}

function makeRegistry() {
  const registry = new ToolRegistry();
  registry.register({
    name: "update_contact",
    description: "Update a contact's fields",
    schema: z
      .object({ contactId: z.string().uuid(), firstName: z.string().min(1) })
      .strict(),
    autonomy: "auto",
    execute: async (
      ctx: OrgCtx,
      args: { contactId: string; firstName: string },
    ) => {
      await ctx.db.query(`update contacts set first_name = $2 where id = $1`, [
        args.contactId,
        args.firstName,
      ]);
      return { ok: true as const, data: { updated: true } };
    },
  });
  registry.register({
    name: "send_quote",
    description: "Send a price quote (approval-gated by default — S8.5)",
    schema: z
      .object({ contactId: z.string().uuid(), amount: z.number() })
      .strict(),
    autonomy: "approval",
    execute: async () => ({ ok: true as const, data: { sent: true } }),
  });
  return registry;
}

describe("harness loop (T26.5)", () => {
  it("runs a scripted tool call: executes, persists tool + assistant messages, meters, audits", async () => {
    const provider = fakeLlm([
      {
        toolCalls: [
          {
            name: "update_contact",
            args: { contactId, firstName: "Scripted" },
          },
        ],
        usage: { in: 100, out: 20 },
      },
      { text: "All done.", usage: { in: 120, out: 10 } },
    ]);

    await withOrg(appService, orgId, async (tx) => {
      await runTurn(
        {
          provider,
          registry: makeRegistry(),
          toolsAllowed: ["update_contact"],
          systemPrompt: "You are a test agent.",
        },
        { orgId, db: tx },
        conversationId,
      );
    });

    const contact = await admin.query(
      `select first_name from contacts where id = $1`,
      [contactId],
    );
    expect(contact.rows[0].first_name).toBe("Scripted");

    const msgs = await admin.query(
      `select role, content, tool_call from messages where conversation_id = $1 order by seq`,
      [conversationId],
    );
    const roles = msgs.rows.map((m) => m.role);
    expect(roles).toContain("tool");
    expect(roles[roles.length - 1]).toBe("agent"); // closing text persisted last

    const usage = await admin.query(
      `select count(*)::int n, coalesce(sum(quantity),0) q from usage_events
			 where org_id = $1 and conversation_id = $2 and kind = 'llm'`,
      [orgId, conversationId],
    );
    expect(usage.rows[0].n).toBe(2); // one meter row per provider.complete

    const auditRows = await admin.query(
      `select count(*)::int n from audit_log where org_id = $1 and action = 'tool.update_contact'`,
      [orgId],
    );
    expect(auditRows.rows[0].n).toBe(1);
  });

  it("guard blocks approval-gated tools: no execution, an approval task is created instead", async () => {
    const provider = fakeLlm([
      {
        toolCalls: [{ name: "send_quote", args: { contactId, amount: 99000 } }],
        usage: { in: 80, out: 15 },
      },
      { text: "Quote needs approval.", usage: { in: 90, out: 8 } },
    ]);

    await withOrg(appService, orgId, async (tx) => {
      await runTurn(
        {
          provider,
          registry: makeRegistry(),
          toolsAllowed: ["send_quote"],
          systemPrompt: "test",
        },
        { orgId, db: tx },
        conversationId,
      );
    });

    const tasks = await admin.query(
      `select count(*)::int n from tasks where org_id = $1 and kind = 'approval' and status = 'open'`,
      [orgId],
    );
    expect(tasks.rows[0].n).toBe(1);
  });

  it("a tool outside tools_allowed is refused even if registered (S8.1 capability boundary)", async () => {
    const provider = fakeLlm([
      {
        toolCalls: [
          { name: "update_contact", args: { contactId, firstName: "Mallory" } },
        ],
        usage: { in: 50, out: 10 },
      },
      { text: "ok", usage: { in: 55, out: 5 } },
    ]);

    await withOrg(appService, orgId, async (tx) => {
      await runTurn(
        {
          provider,
          registry: makeRegistry(),
          toolsAllowed: [],
          systemPrompt: "test",
        },
        { orgId, db: tx },
        conversationId,
      );
    });

    const contact = await admin.query(
      `select first_name from contacts where id = $1`,
      [contactId],
    );
    expect(contact.rows[0].first_name).toBe("Scripted"); // unchanged
  });

  it("hallucinated args die at the Zod seatbelt; the loop persists the failure and survives", async () => {
    const provider = fakeLlm([
      {
        toolCalls: [
          {
            name: "update_contact",
            args: { contactId: "not-a-uuid", nonsense: 1 },
          },
        ],
        usage: { in: 60, out: 12 },
      },
      { text: "recovered", usage: { in: 70, out: 6 } },
    ]);

    await withOrg(appService, orgId, async (tx) => {
      await runTurn(
        {
          provider,
          registry: makeRegistry(),
          toolsAllowed: ["update_contact"],
          systemPrompt: "test",
        },
        { orgId, db: tx },
        conversationId,
      );
    });

    const bad = await admin.query(
      `select tool_call from messages where conversation_id = $1 and role = 'tool'
			 order by seq desc limit 1`,
      [conversationId],
    );
    expect(JSON.stringify(bad.rows[0].tool_call)).toContain("invalid_args");
  });
});
