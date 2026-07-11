# STATE — single source of truth for "where are we"

Overwrite, don't append. Update in the same PR as the work. Fresh sessions start here.
Updated: 2026-07-11 (operating-model reset session)

## NOW (verified facts, not hopes)
- main is green end-to-end, verified cold on 2026-07-11: 14 migrations reset-clean · 47/47 tests
  (incl. cross-tenant denial suite) · rls_coverage 0 offenders · typecheck ✓ · CI run ✓ (~2m15s).
- All ten P0 tasks from project-spec §12 are merged (PRs #2–#11, recovery #15), plus task 11
  (CI parity, #19), task 12 (contacts org-scope, #17), skills (#18), advisors hardening (#20).
- Local stack: `supabase start`; imgproxy + pooler containers stopped is normal (unused locally).
- No cloud project exists yet (supabase/.temp has no project-ref) — extensions decision is still cheap.

## NEXT (top = take it; one task, one branch, one PR)
1. P1 transcript screen in console + S7.1 XSS render-as-text test (the one missing S12.1 control; no external creds needed).
2. Migration 014: move vector + pg_trgm out of `public` into `extensions` schema — do BEFORE first cloud push (see DECISIONS).
3. Vapi real-call spike (task-8 residual) — blocked on VAPI_API_KEY, see WAITING.
4. Staging deploy per runbook (supabase cloud project + VPS/Cloudflare) — blocked on WAITING.

## IN FLIGHT
- PR #21 gitleaks commit-scoping — green, awaiting merge.
- PR: operating-model reset (this file, AGENTS.md contract, real rls gate, lean settings).
- PR: task 13 pipeline hardening (.dockerignore, SHA pins, deploy.yml de-greening, ci concurrency).

## WAITING ON DEVESH
- Merge the in-flight PRs (one at a time, base==main each time).
- Ruleset decision: keep 1-approval (you merge each PR) vs. CI-only merges (agents land on green).
  Flip + rollback commands: see orchestrator/state/ruleset-18778679-backup-2026-07-11.json + final session report.
- VAPI_API_KEY (task-8 acceptance + P1 talking demo).
- Supabase cloud project (staging) when ready to deploy — runbook already delivered.
- Optional: bot PAT for unattended orchestrator runs (S13 preflight); interactive loops work without it.

## DECISIONS (open forks; the noted default is what we build toward)
- webhook_events is a lifecycle table: payload immutable, status/processed_at mutable. Default: keep the
  upd policy shipped in 007; docs updated whenever docs are next touched. (Was the §2 append-only contradiction.)
- Extensions schema: default = move vector+pg_trgm to `extensions` via migration 014 before any cloud push;
  new DDL must schema-qualify or set search_path accordingly.
- Docs demoted from law to reference (AGENTS.md v2). project-spec §12 and docs/patterns/ stay load-bearing.
- bun-types pinned to the bun engine version (1.3.11) — types must not outrun the runtime.

## RECENT (last 5 landings, newest first)
- #20 advisors hardening (initplan wraps, search_path pins) — 2026-07-10
- #19 task 11 CI parity (audit, guards, dist scan, cold image build) — 2026-07-10
- #18 five thin-router skills — 2026-07-10
- #17 task 12 contacts org-scope defense-in-depth — 2026-07-10
- #16 D35 bot-credential mechanism + kill-switch runbook — 2026-07-10
