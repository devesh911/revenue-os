---
name: harness-agent
description: Use BEFORE touching packages/harness — the turn loop, tools, guard() hooks, LLM adapters, context/retrieval, metering, or agent/workflow config. Routes to tech-stack T26.1–T26.8 section by section, the moat invariants, and the harness patterns.
---

# harness-agent — thin router (skills advise, docs rule — CLAUDE.md)

## Read first, in this order (only the § your task touches)
1. `docs/tech-stack.md` T26.1 — module map: file → responsibility → exact interface. `OrgScopedDb` is the ONLY door to data; types live in `src/types.ts`, nowhere else.
2. The T26 § that owns your change: T26.2 workflow JSON · T26.3 agent-config anatomy · T26.4 jobs/durability (closed job-type set; idempotency first lines) · T26.5 the turn loop · T26.6 retrieval + token budgets (system ≤1.5k · KB ≤2k · memories ≤800 · tail ≤3k · tools ≤600) · T26.7 vertical = config rows, never harness code · **T26.8 non-goals — read before adding anything**.
3. `docs/tech-stack.md` T19 (LLM adapters: raw fetch, model tiers) · T11/`docs/patterns/zod-boundary.md` (args validated BEFORE anything runs) · `docs/patterns/pgboss-worker.md` if jobs.
4. Existing code is the spec made real: `packages/harness/src/loop.ts` (the T26.5 order: context → complete → meter → parse → guard → execute → audit → append rows) and `test/loop.test.ts`.

## Review-blocking (moat invariants — spec §9)
- **guard() before ANY side effect; no code path around it.** Approval-gated ⇒ a `tasks` row, never a silent drop. Hooks tighten, never loosen, a tool's default autonomy.
- Stateless loop: every effect is a row; a crash mid-turn loses nothing. No in-memory conversation state, no queues outside pg-boss.
- Zod-parse tool args before `execute()` (hallucination seatbelt); unknown/unallowed tool ⇒ recorded error row.
- Every priced action ⇒ `usage_events`; every executed side effect ⇒ `audit_log`.
- Agents/workflows are versioned — mutating an active version is a bug; eval gate before activation.
- G1: no `bun:*`/`Bun.` in packages/** (lint-enforced). All DB access through the injected `OrgScopedDb` (withOrg tx upstream).

## Commands
`bun test packages/harness` · full gates `bun run gates` · live demo: `bun packages/harness/demo-harness.ts <orgId>` (scripted LLM, real rows).

## Learned since this router was written (dynamic — run it, don't skip)
`grep -inE 'harness|guard|tool|T26|LLM|turn|autonomy' lessons.md` and read `STATE.md → DECISIONS`.
Anything found there outranks this file; on contradiction follow the lesson/decision and append a note that this skill needs a refresh.
