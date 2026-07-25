// T4 — book_appointment tool. RED-phase STUB (no implementation).
// GREEN (worker) replaces the body with the real Zod schema + the two-write withOrg
// transaction: insert appointments RETURNING id, then insert an attributed outcomes row
// (kind 'site_visit_booked', source 'agent', appointment_id = that id) on the SAME ctx.db.
// Spec lives in packages/harness/test/tools.test.ts. G1: runtime-agnostic.
import { z } from "zod";
import type { Tool } from "../types";

export const bookAppointment: Tool = {
  name: "book_appointment",
  description:
    "Book a site-visit appointment and record the attributed outcome.",
  schema: z.unknown(), // STUB: GREEN supplies the validating schema
  autonomy: "auto",
  execute: async () => ({ ok: false as const, error: "not_implemented" }),
};
