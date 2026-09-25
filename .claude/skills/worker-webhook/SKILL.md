---
name: worker-webhook
description: Use BEFORE touching services/worker — webhook receivers or processors, Hono routes, pg-boss jobs, channel sends, scheduler work. Routes to the S6 webhook doctrine, the org-resolution rule, the write-ownership map, and the worker patterns.
---

# worker-webhook — thin router (AGENTS.md is the rulebook; docs/ is reference)

## Read first, in this order
1. `docs/security.md` S6 — all five controls (webhooks are "the doors that open themselves") + S5.1 (Zod on every boundary) + S5.8 (error hygiene).
2. `docs/db-design.md` §8 — `webhook_events` + the **org-resolution rule**: resolve `org_id` BEFORE insert; NULL-org rows are unreachable under RLS.
3. `AGENTS.md` Gotchas — webhooks arrive out of order: upsert by `provider_ref` (partial UNIQUE index, migration 012), order by `messages.seq`; pgboss schema has no RLS (by design); the `workflow_runs (status, wake_at)` scheduler index is sacred.
4. `docs/patterns/hono-route.md` · `docs/patterns/pgboss-worker.md` · `docs/patterns/zod-boundary.md`.
5. `AGENTS.md` Conventions — write ownership: the worker's write set vs the console's; they never cross.
6. `docs/tech-stack.md` T26.4/T26.5 if touching jobs (design intent — check `STATE.md → What works today` for what is real): idempotency as the handler's first lines, the 800ms p95 mid-call tool budget.

## Review-blocking
- Receiver shape (existing code shows it: `services/worker/src/vapi/receive.ts`): read the RAW body → timing-safe check of the shared-secret header (a body signature for providers that sign, e.g. Meta) → Zod envelope → `webhook_events` insert with `dedupe_key` → 202 fast. **Zero side effects in receivers** (S6.4) — processors do the work.
- Unknown event types: stored + skipped, never guessed (S6.5).
- Every write via `withOrg()`; channel sends only through `packages/channels.guard()` (moat invariant #4) — no code path around it.
- Completed conversations require a disposition; outcomes are append-only rows with attribution.

## Commands
`bun test services/worker` · full suite `bun test` · local env comes from `supabase status` (see the export step in `.github/workflows/ci.yml`).

## Learned since this router was written (dynamic — run it, don't skip)
`grep -inE 'webhook|vapi|pg-?boss|worker|hono|cors|dedupe' lessons.md` and read `STATE.md → Decisions in force`.
Findings there outrank this file; on contradiction follow the lesson and note that this skill needs a refresh.

## Before you finish
AGENTS.md → Definition of done. Contract tests must cover out-of-order + duplicate delivery. Synthetic fixtures are interim — real recorded payloads replace them once a real call or message has flowed (ROADMAP Slices 2 and 4). Production send seams are stubs today: check `STATE.md → What works today`. Browser-shaped surfaces need one browser-shaped verification before "done" (lessons.md 2026-07-11).
