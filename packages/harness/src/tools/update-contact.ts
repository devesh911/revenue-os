// T4 — update_contact tool. Updates only the provided fields through ctx.db (the RLS-scoped
// door): a dynamic SET list so an absent field is never touched. Spec:
// packages/harness/test/tools.test.ts. G1: runtime-agnostic.
import { z } from "zod";
import type { Tool } from "../types";

// z.guid() over z.uuid() for the same reason as book_appointment. .refine() requires at least
// one field so an empty update can't reach execute (T11 seatbelt); .strict() rejects unknown keys.
const schema = z
  .object({
    contactId: z.guid(),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
  })
  .strict()
  .refine((v) => v.firstName !== undefined || v.lastName !== undefined, {
    message: "provide at least one of firstName, lastName",
  });

export const updateContact: Tool<z.infer<typeof schema>> = {
  name: "update_contact",
  description: "Update a contact's named fields.",
  schema,
  autonomy: "auto",
  async execute(ctx, args) {
    const sets: string[] = [];
    const values: unknown[] = [args.contactId];
    if (args.firstName !== undefined) {
      values.push(args.firstName);
      sets.push(`first_name = $${values.length}`);
    }
    if (args.lastName !== undefined) {
      values.push(args.lastName);
      sets.push(`last_name = $${values.length}`);
    }
    await ctx.db.query(
      `update contacts set ${sets.join(", ")} where id = $1`,
      values,
    );
    return { ok: true, data: null };
  },
};
