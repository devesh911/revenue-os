---
name: worker-webhook
description: Use BEFORE touching services/worker — webhook receivers or processors, Hono routes, pg-boss jobs, channel sends, scheduler work. Routes to the S6 webhook doctrine, the org-resolution rule, the write-ownership map, and the worker patterns.
---

# worker-webhook — thin router (skills advise, docs rule — AGENTS.md)

## Read first, in this order
1. `docs/security.md` S6 — all five controls (webhooks are "the doors that open themselves") + S5.1 (Zod on every boundary) + S5.8 (error hygiene).
2. `docs/db-design.md` §8 — `webhook_events` + the **org-resolution rule** (D33): resolve `org_id` BEFORE insert; NULL-org rows are unreachable under RLS.
3. `AGENTS.md` Gotchas — webhooks arrive out of order: upsert by `provider_ref` (partial UNIQUE index, migration 012), order by `messages.seq`; pgboss schema has no RLS (by design); the `workflow_runs (status, wake_at)` scheduler index is sacred.
4. `docs/patterns/hono-route.md` · `docs/patterns/pgboss-worker.md` · `docs/patterns/zod-boundary.md`.
5. `docs/dev-workflow.md` §1 — write-ownership (D21): worker's write set vs console's; they never cross.
6. `docs/tech-stack.md` T26.4/T26.5 if touching jobs — closed job-type set, idempotency as the handler's first lines, the 800ms p95 tool budget.

## Review-blocking
- Receiver shape (existing code shows it: `services/worker/src/vapi/receive.ts`): RAW body → timing-safe secret verify → Zod envelope → `webhook_events` insert with `dedupe_key` → 202 fast. **Zero side effects in receivers** (S6.4) — processors do the work.
- Unknown event types: stored + skipped, never guessed (S6.5).
- Every write via `withOrg()`; channel sends only through `packages/channels.guard()` (moat invariant #4) — no code path around it.
- Completed conversations require a disposition; outcomes are append-only rows with attribution.

## Commands
`bun test services/worker` · full suite `bun test` · local env comes from `supabase status` (see the export step in `.github/workflows/ci.yml`).

## Before you finish
Dev-workflow §6 DoD. Contract tests must cover out-of-order + duplicate delivery (T12 layer 4). Synthetic fixtures are interim — real recorded payloads replace them at the task-8 spike (spec §12b residual).
