# STATE — single source of truth for "where are we"

Overwrite, don't append. Update in the same PR as the work. Fresh sessions start here.
Updated: 2026-07-11 (post-move refresh: #24–#27 landed, #28 closed as duplicate)

## NOW (verified facts, not hopes)
- main@3839ee4 green end-to-end: 15 migrations (000–014) reset-clean · **62/62 tests** (incl.
  cross-tenant denial + gitleaks-config suites) · rls_coverage 0 offenders (gate RAISES on
  offenders) · typecheck ✓ · lint ✓ · CI ✓. Deploy stubs SKIP on main pushes (task 14 arms them).
- **Cloud exists**: Supabase project linked, all 15 migrations pushed, local↔remote in sync
  (Phase 0–1 verified 2026-07-11). GitHub `staging` environment exists with
  SUPABASE_ACCESS_TOKEN + SUPABASE_DB_PASSWORD (Phase 2 re-done by Devesh, verified via API).
- **Repo moved**: local checkout lives at `~/revenue-os` (was `~/Downloads/revenue-os` — macOS
  TCC blocked the old path). Memory, supabase link state, and gates all verified post-move.
- **Autonomy v2.1 is live**: ruleset = PR + green `checks`, zero human approvals (Devesh flipped it);
  repo has allow_auto_merge + delete_branch_on_merge ON; agent sessions may create PRs, resolve
  conflicts, and merge on green (named grant, 2026-07-11). Guard loosening stays Devesh-only.
- Operating contract: AGENTS.md (one page). Docs are reference; spec §12 + patterns/ load-bearing.
- Local stack: `supabase start`; imgproxy + pooler containers stopped is normal (unused locally).

## NEXT (top = take it; one task, one branch, one PR)
1. Staging deploy per runbook (task 14): GitHub side is ready (env + secrets verified); still
   needs the VPS box + Cloudflare Pages connect (WAITING) before arming deploy.yml.
2. Vapi spike REMOTE half (needs VPS public URL): real webhook delivery (S6.2 x-vapi-secret header
   confirm), real call, recorded payloads replace synthetic fixtures, India number decision (BYO SIP
   trunk — Exotel/Plivo; account has 0 numbers/credentials).
3. Wire the P2 pg-boss consumer for webhook_events → processVapiEvents (processor currently invoked
   only by tests/spike; receiver+processor both proven live-locally).
4. Link LiveMonitor/Contacts lists to `/o/:orgId/conversations/:id` transcripts (P3 polish, when those screens get data).

## IN FLIGHT
- (none)

## WAITING ON DEVESH
- VPS box + Cloudflare Pages connect — NEXT 1 and 2 ride these (Supabase cloud + GitHub env are done).
- Vapi India telephony decision inputs: Exotel vs Plivo SIP trunk account (spec risk #4).
- Stale merged branches: agents are classifier-blocked from `git push origin --delete`; run flip-kit
  item 5 (orchestrator/state/FLIP-KIT-2026-07-11.md) or leave them.
- Optional: bot PAT for unattended orchestrator runs; interactive loops don't need it.

## DECISIONS (open forks; the noted default is what we build toward)
- **Autonomy v2.1 (2026-07-11, Devesh):** agents run PR-create → conflict-resolve → merge end-to-end on
  green checks. Acknowledged trade-off; posture is "tighten as requirements follow". Hard rails
  (secrets/cloud/tenancy/history/sends) unchanged; guard loosening remains human-only.
- **#28 closed unmerged (2026-07-11):** the queued ".gitleaks.toml commit-scoping" task had already
  landed as #21; the re-execution would have regressed main (dropped the b207595 excusal). Queued
  tasks get checked against main before execution, not just against the queue.
- webhook_events is a lifecycle table: payload immutable, status/processed_at mutable. Docs catch up
  whenever docs are next touched.
- Extensions schema: DONE — migration 014 (#26) moved vector+pg_trgm to `extensions`; role
  search_path carries unqualified runtime access; migration DDL must qualify from now on.
- bun-types stays pinned to the bun engine version (both 1.3.11).
- Cloudflare Bot Fight Mode stays OFF (S4.3 conflict): non-Enterprise BFM is zone-wide, no per-path
  skip, and would challenge Vapi webhooks (lost call events). Revisit when apps/www exists.
- Vapi `server.secret` is write-only at the API (GET never echoes it): .env/password-manager holds
  the only copy; rotation = overwrite assistant config + VPS env together.

## RECENT (last 5 landings, newest first)
- #28 CLOSED unmerged — duplicate of #21, would have regressed the gitleaks allowlist — 2026-07-11
- #27 vapi spike local half (account verified, receiver 500→400, root dev script fixed) — 2026-07-11
- #26 migration 014 — vector + pg_trgm to `extensions` schema — 2026-07-11
- #25 transcript UI + S7.1 XSS render-as-text test (closes last S12.1 control) — 2026-07-11
- #24 STATE refresh — autonomy v2.1 live — 2026-07-11
