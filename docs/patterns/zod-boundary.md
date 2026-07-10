# Pattern: one Zod schema = runtime validation + TS type + tool seatbelt
```ts
// packages/shared/src/schemas/appointment.ts
export const BookAppointment = z.object({
  contactId: z.string().uuid(),
  startsAt: z.string().datetime(),
  kind: z.enum(["sales_call", "site_visit"]),
}).strict();
export type BookAppointment = z.infer<typeof BookAppointment>;

// harness tool (S8.1): args validated BEFORE anything executes
registry.register({ name: "book_appointment", schema: BookAppointment, autonomy: "auto",
  execute: (ctx, args) => appointments.book(ctx, args) });
```
Rules: schemas live in packages/shared · .strict() when the shape is closed · webhooks parse the RAW-verified body with these.
