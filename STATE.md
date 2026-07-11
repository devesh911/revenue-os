# STATE — single source of truth for "where are we"

Overwrite, don't append. Update in the same PR as the work. Fresh sessions start here.
Updated: 2026-07-11 (autonomy-live refresh, after the #21→#23 merge train)

## NOW (verified facts, not hopes)
- main@4bf126a green end-to-end: 14 migrations reset-clean · **51/51 tests** (incl. cross-tenant denial
  + gitleaks-config suites) · rls_coverage 0 offenders (gate now RAISES on offenders) · typecheck ✓ ·
  lint ✓ · CI ✓. Deploy stubs SKIP on main pushes (no more false-green deploy history).
- **Autonomy v2.1 is live**: ruleset = PR + green `checks`, zero human approvals (Devesh flipped it);
  repo has allow_auto_merge + delete_branch_on_merge ON; agent sessions may create PRs, resolve
  conflicts, and merge on green (named grant, 2026-07-11). Guard loosening stays Devesh-only.
- Operating contract: AGENTS.md (one page). Docs are reference; spec §12 + patterns/ load-bearing.
- Local stack: `supabase start`; imgproxy + pooler containers stopped is normal (unused locally).
- No cloud project exists yet — the extensions-schema move (migration 014) is still a cheap edit.

## NEXT (top = take it; one task, one branch, one PR)
1. P1 transcript screen in console + S7.1 XSS render-as-text test (last unchecked S12.1 control; no external creds).
2. Migration 014: move vector + pg_trgm from `public` to `extensions` schema — BEFORE first cloud push.
3. Vapi real-call spike (task-8 residual) — blocked on VAPI_API_KEY (WAITING).
4. Staging deploy per runbook (supabase cloud project + VPS/Cloudflare) — blocked on WAITING.

## IN FLIGHT
(nothing — this refresh is the only open PR when it merges)

## WAITING ON DEVESH
- VAPI_API_KEY (task-8 acceptance + P1 talking demo).
- Supabase cloud project (staging) when ready to deploy — runbook in orchestrator/state + session reports.
- Stale merged branches: agents are classifier-blocked from `git push origin --delete`; run flip-kit
  item 5 (orchestrator/state/FLIP-KIT-2026-07-11.md) or leave them.
- Optional: bot PAT for unattended orchestrator runs; interactive loops don't need it.

## DECISIONS (open forks; the noted default is what we build toward)
- **Autonomy v2.1 (2026-07-11, Devesh):** agents run PR-create → conflict-resolve → merge end-to-end on
  green checks. Acknowledged trade-off; posture is "tighten as requirements follow". Hard rails
  (secrets/cloud/tenancy/history/sends) unchanged; guard loosening remains human-only.
- webhook_events is a lifecycle table: payload immutable, status/processed_at mutable. Docs catch up
  whenever docs are next touched.
- Extensions schema: default = migration 014 moves vector+pg_trgm to `extensions` before any cloud push.
- bun-types stays pinned to the bun engine version (both 1.3.11).

## RECENT (last 5 landings, newest first)
- #23 task 13 pipeline hardening (.dockerignore, SHA pins, honest deploy skips, CI fail-fast) — 2026-07-11
- #22 operating model v2 (AGENTS.md contract, STATE.md, real RLS gate, lint unbreak) — 2026-07-11
- #21 gitleaks commit-scoping (+4 config tests) — 2026-07-11
- #20 advisors hardening (initplan wraps, search_path pins) — 2026-07-10
- #19 task 11 CI parity (audit, guards, dist scan, cold image build) — 2026-07-10
