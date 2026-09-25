---
name: db-work
description: Use BEFORE any migration, schema, RLS policy, index, seed, or packages/db change — routes to the db-design reference sections, the replay/RLS gates, and the review-blocking checks for database work in revenue-os.
---

# db-work — thin router (AGENTS.md is the rulebook; docs/ is reference)

## Read first, in this order
1. `supabase/migrations/` — the real schema. `docs/db-design.md` header note maps the baseline 000–009 to its sections.
2. `docs/db-design.md` §2 — conventions (org_id first column, timestamps, the append-only list, money, E.164 before insert).
3. `docs/db-design.md` §4 — RLS helpers, the grants block, the policy pattern (**illustrative, not positional** — policies live in the SAME migration as their table), and the write-role mapping (D33).
4. The § that owns your tables: §5 CRM · §6 conversations/outcomes · §7 harness · §8 ops · §13 prospects · §14 support access.
5. `AGENTS.md` hard rails 3–4 — tenancy, expand–contract only, **never edit applied migrations**.
6. `docs/patterns/drizzle-query.md` — the real idiom: parameterised `tx.query` inside `withOrg`.
7. **Learned since (dynamic — run it, don't skip):** `grep -inE 'migration|rls|db-design|schema|index|seed|42501|42704' lessons.md` and read `STATE.md → Decisions in force`. Findings there outrank this file; on contradiction follow the lesson and note that this skill needs a refresh.

## Review-blocking (AGENTS.md hard rails)
- New table ⇒ `org_id` + policies in the same migration + `tests/rls_coverage.sql` expectation + a cross-tenant denial test (S1.1/S1.4).
- All DML through `packages/db` `withOrg()` (S1.3). Raw pool access or `service_role` anywhere in app code = blocker (S1.2).
- Append-only tables get `sel` + `ins` policies only. Outcomes are append-only rows with attribution, never status strings.
- DDL lives only in `supabase/migrations/`. App queries are parameterised `tx.query` inside `withOrg`, `org_id` in every where, never string concatenation.

## Commands (scripts are the interface)
`bun run db:reset` (must replay clean from zero) · `bun run rls:check` (must exit 0 with `rls_coverage: 0 offenders`; any table without RLS raises and fails) · `bun test packages/db` · `bun run db:seed <pack>`

## Before you finish
Meet AGENTS.md → Definition of done. A doc that contradicts the code gets fixed in the same PR, with a `STATE.md → Decisions in force` line if a decision was made.
