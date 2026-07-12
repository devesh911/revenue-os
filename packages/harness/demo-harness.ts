// Demo driver (transient, not part of the product): run ONE real harness turn (T26.5
// runTurn — real DB rows, scripted LLM) into the seeded real_estate org so the console
// can show it. Same shape as packages/harness/test/loop.test.ts, narrated for a human.

import { createPool, withOrg } from "@revenue-os/db";
import { z } from "zod";
import { runTurn, ToolRegistry } from "./src/index";
import type { LlmProvider, LlmTurn, OrgCtx } from "./src/types";

const ORG_ID = process.argv[2];
if (!ORG_ID) throw new Error("usage: bun scripts/demo-harness.ts <orgId>");

const pool = createPool(
  process.env.DATABASE_URL ||
    "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres",
);

function scriptedLlm(turns: LlmTurn[]): LlmProvider {
  let i = 0;
  return {
    complete: async () => turns[Math.min(i++, turns.length - 1)],
  };
}

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
  description: "Send a price quote (approval-gated — S8.5)",
  schema: z
    .object({ contactId: z.string().uuid(), amountInr: z.number() })
    .strict(),
  autonomy: "approval",
  execute: async () => ({ ok: true as const, data: { sent: true } }),
});

const result = await withOrg(pool, ORG_ID, async (tx) => {
  const contact = await tx.query(
    `insert into contacts (org_id, first_name) values ($1, 'Unknown Caller') returning id`,
    [ORG_ID],
  );
  const contactId = contact.rows[0].id as string;
  const convo = await tx.query(
    `insert into conversations (org_id, contact_id, channel, direction, status)
		 values ($1, $2, 'whatsapp', 'inbound', 'active') returning id`,
    [ORG_ID, contactId],
  );
  const conversationId = convo.rows[0].id as string;
  await tx.query(
    `insert into messages (org_id, conversation_id, seq, role, content)
		 values ($1, $2, 1, 'contact', $3)`,
    [
      ORG_ID,
      conversationId,
      "Hi, this is Priya — I saw your ad. Looking for a 2BHK in Baner under 80 lakh.",
    ],
  );

  const provider = scriptedLlm([
    {
      toolCalls: [
        { name: "update_contact", args: { contactId, firstName: "Priya" } },
        { name: "send_quote", args: { contactId, amountInr: 7_800_000 } },
      ],
      usage: { in: 412, out: 58 },
    },
    {
      text: "Thanks Priya! A 2BHK in Baner under ₹80L — we have three matching projects. I've sent the price quotes for approval; meanwhile, would a Saturday site visit suit you?",
      usage: { in: 486, out: 74 },
    },
  ]);

  const ctx: OrgCtx = { orgId: ORG_ID, db: tx };
  await runTurn(
    {
      provider,
      registry,
      toolsAllowed: ["update_contact", "send_quote"],
      systemPrompt:
        "You are the Revenue OS real-estate assistant. Qualify the lead, never send quotes without approval.",
      providerName: "scripted-demo",
    },
    ctx,
    conversationId,
  );

  const messages = await tx.query(
    `select seq, role, coalesce(content, tool_call::text) as body
		 from messages where conversation_id = $1 order by seq`,
    [conversationId],
  );
  const tasks = await tx.query(
    `select kind, title, payload from tasks where conversation_id = $1`,
    [conversationId],
  );
  const usage = await tx.query(
    `select kind, provider, quantity, unit from usage_events where conversation_id = $1`,
    [conversationId],
  );
  const audit = await tx.query(
    `select actor_type, action from audit_log where resource_id = $1::text`,
    [conversationId],
  );
  return { conversationId, contactId, messages, tasks, usage, audit };
});

console.log(`conversation: ${result.conversationId}`);
console.log("\n== messages (seq · role · body) ==");
for (const m of result.messages.rows)
  console.log(`${m.seq} · ${m.role} · ${String(m.body).slice(0, 160)}`);
console.log("\n== human tasks created by the guard ==");
for (const t of result.tasks.rows)
  console.log(`${t.kind} · ${t.title} · ${JSON.stringify(t.payload)}`);
console.log("\n== usage metered ==");
for (const u of result.usage.rows)
  console.log(`${u.kind} · ${u.provider} · ${u.quantity} ${u.unit}`);
console.log("\n== audit trail ==");
for (const a of result.audit.rows) console.log(`${a.actor_type} · ${a.action}`);

await pool.end();
