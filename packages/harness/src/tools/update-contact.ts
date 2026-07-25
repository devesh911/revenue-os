// T4 — update_contact tool. RED-phase STUB (no implementation).
// GREEN (worker) replaces the body with the real Zod schema + an `update contacts set ...`
// through ctx.db (the RLS-scoped door). Spec: packages/harness/test/tools.test.ts.
// G1: runtime-agnostic.
import { z } from "zod";
import type { Tool } from "../types";

export const updateContact: Tool = {
  name: "update_contact",
  description: "Update a contact's named fields.",
  schema: z.unknown(), // STUB: GREEN supplies the validating schema
  autonomy: "auto",
  execute: async () => ({ ok: false as const, error: "not_implemented" }),
};
