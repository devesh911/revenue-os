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
1. Staging deploy per runbook (task 14): supabase cloud Phase 0–2 + VPS — blocked on WAITING.
2. Vapi spike REMOTE half (needs VPS public URL): real webhook delivery (S6.2 x-vapi-secret header
   confirm), real call, recorded payloads replace synthetic fixtures, India number decision (BYO SIP
   trunk — Exotel/Plivo; account has 0 numbers/credentials).
3. Wire the P2 pg-boss consumer for webhook_events → processVapiEvents (processor currently invoked
   only by tests/spike; receiver+processor both proven live-locally).
4. Link LiveMonitor/Contacts lists to `/o/:orgId/conversations/:id` transcripts (P3 polish, when those screens get data).

## IN FLIGHT
- feat/vapi-spike-local (this PR): Vapi local spike — account/key verified, S6.2 config half
  confirmed, receiver 500→400 fix (repro-first), root `bun run dev` fixed (never worked),
  scripts/spike-vapi.ts committed for post-VPS reruns.

## WAITING ON DEVESH
- Supabase cloud project Phase 0–1 (runbook) + VPS box + Cloudflare Pages connect — the whole NEXT queue rides these.
- Vapi India telephony decision inputs: Exotel vs Plivo SIP trunk account (spec risk #4).
- Stale merged branches: agents are classifier-blocked from `git push origin --delete`; run flip-kit
  item 5 (orchestrator/state/FLIP-KIT-2026-07-11.md) or leave them.
- Optional: bot PAT for unattended orchestrator runs; interactive loops don't need it.

## DECISIONS (open forks; the noted default is what we build toward)
- **Autonomy v2.1 (2026-07-11, Devesh):** agents run PR-create → conflict-resolve → merge end-to-end on
  green checks. Acknowledged trade-off; posture is "tighten as requirements follow". Hard rails
  (secrets/cloud/tenancy/history/sends) unchanged; guard loosening remains human-only.
- webhook_events is a lifecycle table: payload immutable, status/processed_at mutable. Docs catch up
  whenever docs are next touched.
- Extensions schema: DONE — migration 014 moved vector+pg_trgm to `extensions` (this PR); role
  search_path carries unqualified runtime access; migration DDL must qualify from now on.
- bun-types stays pinned to the bun engine version (both 1.3.11).
- Cloudflare Bot Fight Mode stays OFF (S4.3 conflict): non-Enterprise BFM is zone-wide, no per-path
  skip, and would challenge Vapi webhooks (lost call events). Revisit when apps/www exists.
- Vapi `server.secret` is write-only at the API (GET never echoes it): .env/password-manager holds
  the only copy; rotation = overwrite assistant config + VPS env together.

## RECENT (last 5 landings, newest first)
- #23 task 13 pipeline hardening (.dockerignore, SHA pins, honest deploy skips, CI fail-fast) — 2026-07-11
- #22 operating model v2 (AGENTS.md contract, STATE.md, real RLS gate, lint unbreak) — 2026-07-11
- #21 gitleaks commit-scoping (+4 config tests) — 2026-07-11
- #20 advisors hardening (initplan wraps, search_path pins) — 2026-07-10
- #19 task 11 CI parity (audit, guards, dist scan, cold image build) — 2026-07-10
