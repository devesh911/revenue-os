---
name: db-work
description: Use BEFORE any migration, schema, RLS policy, index, seed, or packages/db change — routes to the exact db-design/dev-workflow sections, the replay/RLS gates, and the review-blocking checks for database work in revenue-os.
---

# db-work — thin router (skills advise, docs rule — CLAUDE.md)

## Read first, in this order
1. `docs/db-design.md` header note — migration↔section numbering truth (D33: baseline 000–009 = §3–§8 + §13 + §14).
2. `docs/db-design.md` §2 — conventions (org_id first column, timestamps, the append-only list, money, E.164 before insert).
3. `docs/db-design.md` §4 — RLS helpers, the grants block, the policy pattern (**illustrative, not positional** — policies live in the SAME migration as their table), and the write-role mapping (D33).
4. The § that owns your tables: §5 CRM · §6 conversations/outcomes · §7 harness · §8 ops · §13 prospects · §14 support access.
5. `docs/dev-workflow.md` §7 — expand–contract only; **never edit applied migrations**.
6. `docs/patterns/drizzle-query.md` — imitate over training memory.
7. `lessons.md` — search `task 2`, `db`, `migration` before assuming the docs are complete.

## Review-blocking (CLAUDE.md non-negotiables)
- New table ⇒ `org_id` + policies in the same migration + `tests/rls_coverage.sql` expectation + a cross-tenant denial test (S1.1/S1.4).
- All DML through `packages/db` `withOrg()` (S1.3). Raw pool access or `service_role` anywhere in app code = blocker (S1.2).
- Append-only tables get `sel` + `ins` policies only. Outcomes are append-only rows with attribution, never status strings.
- Raw SQL lives only in `supabase/migrations/`; Drizzle (or sanctioned `sql\`\``) everywhere else.

## Commands (scripts are the interface — dev-workflow §9)
`bun run db:reset` (must replay clean from zero) · `bun run rls:check` (must return 0 rows) · `bun test packages/db` · `bun run db:seed <pack>`

## Before you finish
Fill dev-workflow §6 DoD. Doc contradiction found → append `lessons.md`, then §13 triage: blocking ⇒ mini-ADR PR now (see the doc-change skill); cosmetic ⇒ Friday batch.
