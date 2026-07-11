# Revenue OS — operating contract (v2 · 2026-07-11)

One page. If a rule is not on it, it is advice, not law. **STATE.md** says where we are;
**docs/** is reference material. This file is harness-agnostic — Claude, Codex, or human, same contract.

## Hard rails (never, no exceptions)
1. **Secrets** — never read/write `.env*` values; never paste tokens into chat, commits, or logs.
2. **Cloud** — no prod deploys; no `supabase link` / remote `db push` from agent sessions. Cloud pushes happen in Devesh's terminal.
3. **Tenancy** — every table ships with org_id + RLS + a cross-tenant denial test. DB access only via packages/db (app_service + request.org_id). Never SUPABASE_SERVICE_ROLE_KEY in app code.
4. **History** — migrations are append-only (expand-contract); never edit an applied one; never force-push a shared branch.
5. **Sends** — outbound messages only through packages/channels guard(); tool side-effects pass autonomy checks.
6. **main is PR-only with CI green** (required check: `checks`). Merging follows the repo ruleset — currently Devesh's act.

## The loop (any planner/executor/verifier, human or AI)
1. Take the top item of `STATE.md → NEXT` (or Devesh's explicit ask). One task, one branch, one PR.
2. Branch `feat/…` or `fix/…` off up-to-date main. Build with tests at the layer touched; bug fixes start from the failing repro.
3. `bun run gates` green locally. Never pipe a gate through anything that can swallow its exit code — a gate that didn't demonstrably run proves nothing.
4. PR body: what / why / evidence (paste gate output). Then watch CI: `gh pr checks <n> --watch`. Green means observed green.
5. Merge one PR at a time; confirm `base == main` before each; never loop merges.
6. Same PR updates `STATE.md` (NOW / NEXT / RECENT). Genuine surprises → one factual line appended to lessons.md. Blocked is not a surprise: blocked goes to `STATE.md → WAITING`.

## Escalate to Devesh only for
credentials · money · external accounts · irreversible or outward-facing actions · genuine product-direction forks.
Everything else: pick the boring option, record one line in `STATE.md → DECISIONS`, keep moving.

## Docs policy (v2 — demoted from law to reference)
docs/ records intent; code + tests are the truth for what exists. On conflict: build the correct thing, add a DECISIONS line, move on — no ADR ceremony, no doc-editing sprees. Devesh curates docs/ when he chooses. Two things in docs/ stay load-bearing: **project-spec §12** (the product roadmap) and **docs/patterns/** (the style to imitate over training memory).

## Commands (scripts are the interface — never call tools directly when a script exists)
`bun run gates` (typecheck+lint+test+rls) · `bun run dev` · `bun run db:reset` · `bun run db:seed <pack>` · `bun run evals` · `bun run guards`

## Conventions (unchanged, load-bearing)
TS strict · Zod at every boundary (schemas in packages/shared) · Drizzle for queries (sql`` where clearer) ·
money = numeric+currency · phones E.164 normalized BEFORE insert · pino logs {org_id, run_id, conversation_id} ·
worker owns writes to runs/conversations/messages/memories/usage/scores; console owns tasks-status/dispositions/config/drafts ·
completed conversations require a disposition; outcomes are append-only rows with attribution, never status strings ·
agents/workflows are versioned — mutating an active version is a bug; eval gate before activation ·
G1: no `bun:*` imports or `Bun.` globals in packages/** (lint-enforced).

## Gotchas
pgboss schema is pgboss.* — no RLS there. workflow_runs (status, wake_at) index is sacred.
Vapi webhooks arrive out of order: upsert by provider_ref, order by messages.seq; verify signature on the RAW body,
insert webhook_events (dedupe_key), return fast; side effects in workers.
webhook_events is a **lifecycle** table: `payload` is immutable, status/processed_at columns may update.
Worktrees live under .claude/worktrees/ — ignored by git and biome; a checked-out worktree inside the repo must never enter lint scope.
