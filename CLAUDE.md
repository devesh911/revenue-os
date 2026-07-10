# Revenue OS — working agreements (read fully before any structural change)
Docs are law: docs/project-spec.md, docs/db-design.md, docs/tech-stack.md, docs/security.md, docs/dev-workflow.md.
Imitate docs/patterns/* over training memory. Read any matching .claude/skills/ before work — skills advise, docs rule. If code and docs disagree: docs win; note the conflict in lessons.md. Doc changes only via the decision protocol (docs/dev-workflow.md §13) — never edit docs/** directly.

## Session protocol
Plan first (files, tests, ambiguities) -> wait for approval -> TDD (failing tests -> green -> refactor) -> fill the Definition of Done in the PR body (dev-workflow §6). One task per session. Surprises -> append lessons.md; never silently change scope or docs.

## Commands (scripts are the interface — never call tools directly if a script exists)
bun run dev · bun test · bun run lint · bun run typecheck · bun run db:migrate · bun run db:reset · bun run db:seed <pack> · bun run rls:check · bun run evals

## Non-negotiables (review-blocking)
- Every new table: org_id + RLS policies + rls_coverage expectation + a cross-tenant denial test.
- Never use SUPABASE_SERVICE_ROLE_KEY anywhere in app code; DB access only via packages/db (app_service + request.org_id).
- Channel sends only through packages/channels guard(); tool side-effects pass autonomy checks.
- Completed conversations require a disposition. Outcomes are append-only rows with attribution, never status strings.
- Agents/workflows are versioned; mutating an active version is a bug. Eval gate before activation.
- TDD: no feature without tests at its layer; bug fixes start with the failing repro test.
- G1: no `bun:*` imports or `Bun.` globals in packages/** (lint-enforced). Bun-specific code lives in app entrypoints only.
- Migrations: never edit applied ones; expand-contract only; raw SQL lives only in supabase/migrations/.
- New dependency ⇒ BOM row in docs/tech-stack.md T24 + justification in the PR. Platform before packages.
- Never touch .env/secrets; never deploy prod (CI only); local/staging only (security S11.5).

## Conventions
TS strict; Drizzle for queries (sql`` sanctioned where clearer); Zod at every boundary (schemas in packages/shared);
pino logs {org_id, run_id, conversation_id}; money = numeric+currency; phones = E.164 normalized BEFORE insert;
worker owns writes to runs/conversations/messages/memories/usage/scores; console owns tasks-status/dispositions/config/drafts.

## Gotchas
pgboss schema is pgboss.* — no RLS there. workflow_runs scheduler index (status, wake_at) is sacred.
Vapi webhooks arrive out of order: upsert by provider_ref, order by messages.seq. Webhooks: verify signature on RAW body, insert webhook_events (dedupe_key), return fast; side effects in workers.

## Orchestrator (/goal)
Typing /goal summons the autonomous multi-agent cockpit in orchestrator/ — its own nested git repo (ignored by this one) with the full protocol in orchestrator/CLAUDE.md: Fable orchestrates/reviews, Opus implements, Haiku scouts; stacked feat/task-NN branches, PR per task, HANDOFF state, watchdog auto-resume. Safety rails: docs/security.md S13 (all nine, non-negotiable). Agents never merge, never touch docs/** or .env, never deploy prod.
