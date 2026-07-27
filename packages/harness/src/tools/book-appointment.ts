// T4 — book_appointment tool. Two writes on the caller's withOrg tx (ctx.db): insert the
// appointment RETURNING id, then an attributed outcomes row (kind 'site_visit_booked',
// source 'agent', appointment_id = that id, conversation_id = ctx.conversationId → the run via
// conversations.workflow_run_id) on the SAME handle. Errors PROPAGATE so the enclosing withOrg
// rolls back both — atomicity (a swallowed error orphans the appointment).
// Spec: packages/harness/test/tools.test.ts. G1: runtime-agnostic.
import { z } from "zod";
import type { Tool } from "../types";

// contactId is z.guid() (UUID shape), not z.uuid(): Zod 4's uuid() enforces the RFC-9562
// version/variant nibbles, which real gen_random_uuid() ids satisfy but test fixtures need
// not. Shape-validation is the T11 seatbelt; RLS + the contacts FK are the real guarantee.
const schema = z
  .object({
    contactId: z.guid(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    timezone: z.string().min(1),
  })
  .strict();

export const bookAppointment: Tool<z.infer<typeof schema>> = {
  name: "book_appointment",
  description:
    "Book a site-visit appointment and record the attributed outcome.",
  schema,
  autonomy: "auto",
  async execute(ctx, args) {
    const appt = await ctx.db.query(
      `insert into appointments (org_id, contact_id, kind, starts_at, ends_at, timezone, created_by)
       values ($1, $2, 'site_visit', $3, $4, $5, 'agent') returning id`,
      [ctx.orgId, args.contactId, args.startsAt, args.endsAt, args.timezone],
    );
    const appointmentId = appt.rows[0]?.id;
    await ctx.db.query(
      `insert into outcomes (org_id, contact_id, appointment_id, conversation_id, kind, source)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        ctx.orgId,
        args.contactId,
        appointmentId,
        ctx.conversationId ?? null,
        "site_visit_booked",
        "agent",
      ],
    );
    return { ok: true, data: { appointmentId } };
  },
};
