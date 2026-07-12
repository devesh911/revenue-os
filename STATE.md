PHASE: SETUP  <!-- D36: SETUP = speed (agents merge on green); LIVE = full force. Flip is Devesh-only, via docs/runbooks/go-live.md -->

# STATE — single source of truth for "where are we"

Overwrite, don't append. Update in the same PR as the work. Fresh sessions start here.
Updated: 2026-07-12 (deep clean: D36 phased posture, merge-authority contradictions resolved)

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
- **Infra (2026-07-12):** VPS `168.144.147.90` hardened per runbook §2–§3 (deploy user, key-only
  sshd, ufw 443/22-limit, fail2ban, Docker, 2GB swap, resized to 1vCPU/2GB/48GB; `~/app` staged,
  `.env` pending). **Console is LIVE on Cloudflare Pages**: https://revenue-os-console.pages.dev
  (project `revenue-os-console`, GitHub-connected, push-to-deploy on main; build env
  SKIP_DEPENDENCY_INSTALL=1 + BUN_VERSION=1.3.11 — Pages' npm auto-install chokes on
  `workspace:*`; VITE_ vars point at staging Supabase `ajtfillmkjhoffxllqja`, Mumbai).
- Operating contract: AGENTS.md (one page). Docs are reference; spec §12 + patterns/ load-bearing.
- Local stack: `supabase start`; imgproxy + pooler containers stopped is normal (unused locally).

## NEXT (top = take it; one task, one branch, one PR)
1. Staging deploy per runbook (task 14): GitHub side is ready (env + secrets verified); still
   needs the VPS box + Cloudflare Pages connect (WAITING) before arming deploy.yml.
2. Vapi spike REMOTE half (needs VPS public URL): real webhook delivery (S6.2 x-vapi-secret header
   confirm), real call, recorded payloads replace synthetic fixtures, India number decision (BYO SIP
   trunk — Exotel/Plivo; account has 0 numbers/credentials).
3. Link LiveMonitor/Contacts lists to `/o/:orgId/conversations/:id` transcripts (P3 polish, when those screens get data).

## IN FLIGHT
- docs/d36-phased-security-posture (this PR): PHASE switch + D36 ADR + all six
  merge-authority statements reconciled + docs/runbooks/go-live.md (Devesh's go-live
  checklist). Commissioned deep clean, merge-on-green chosen explicitly.

## WAITING ON DEVESH
- **Domain purchase** — the Cloudflare zone (api DNS, Transform Rule, origin lockdown), Pages
  custom domain, and the Vapi remote spike all wait on it (runbook §4 executes the day it exists).
- **`supabase db push` from your terminal** — staging cloud is at migration 014; 015 (pgboss)
  postdates the last push. The worker cannot boot against staging until this lands.
- **VPS `~/app/.env`** — fill the five names in `.env.template` (password manager), then
  `mv .env.template .env && chmod 600 .env`.
- **CI deploy credentials** (classifier-blocked for agents): generate + wire the staging SSH key,
  either by naming the action to an agent session or yourself:
  `ssh deploy@168.144.147.90 'ssh-keygen -q -t ed25519 -f ~/.ssh/ci_deploy -N "" && cat ~/.ssh/ci_deploy.pub >> ~/.ssh/authorized_keys && cat ~/.ssh/ci_deploy'` → `gh secret set STAGING_SSH_KEY --env staging` → delete `~/.ssh/ci_deploy` from the box.
- Vapi India telephony decision inputs: Exotel vs Plivo SIP trunk account (spec risk #4).
- Stale merged branches: agents are classifier-blocked from `git push origin --delete`; run flip-kit
  item 5 (orchestrator/state/FLIP-KIT-2026-07-11.md) or leave them.
- Optional: bot PAT for unattended orchestrator runs; interactive loops don't need it.

## DECISIONS (open forks; the noted default is what we build toward)
- **D36 phased posture (2026-07-12, Devesh):** PHASE line above is the one truth. SETUP = agents
  merge independent PRs (squash) on observed-green + tested evidence; LIVE = ruleset-enforced
  human merges, full S13, monitoring on. Flip via docs/runbooks/go-live.md, Devesh-only. All
  SETUP-era secrets are treated as burned (rotation is a go-live step). Supersedes the ad-hoc
  autonomy-v2.1 wording; hard rails (secrets/tenancy/history/sends/webhooks/CI-anchor) are
  phase-independent. Guard/deny-list loosening stays Devesh-only in both phases.
- **#28 closed unmerged (2026-07-11):** the queued ".gitleaks.toml commit-scoping" task had already
  landed as #21; the re-execution would have regressed main (dropped the b207595 excusal). Queued
  tasks get checked against main before execution, not just against the queue.
- webhook_events is a lifecycle table: payload immutable, status/processed_at mutable. Docs catch up
  whenever docs are next touched.
- Extensions schema: DONE — migration 014 (#26) moved vector+pg_trgm to `extensions`; role
  search_path carries unqualified runtime access; migration DDL must qualify from now on.
- The T26.4 closed job-type set gains `webhook.process.vapi` (receiver-enqueued drain; RLS makes
  a cross-org sweep impossible for app_service, so the org id rides the job). Docs catch up
  whenever tech-stack is next touched.
- **Agent dispatch economy (2026-07-12, Devesh):** worker/tester/scout agents now live in the
  main repo `.claude/agents/` (shim-based /goal sessions could never see the orchestrator/ copies
  — that's why usage was 100% Fable). Models: worker+tester=sonnet (downshifted from opus),
  scout=haiku; the main thread orchestrates/reviews only, routine RED/GREEN/recon is dispatched.
- bun-types stays pinned to the bun engine version (both 1.3.11).
- Cloudflare Bot Fight Mode stays OFF (S4.3 conflict): non-Enterprise BFM is zone-wide, no per-path
  skip, and would challenge Vapi webhooks (lost call events). Revisit when apps/www exists.
- Vapi `server.secret` is write-only at the API (GET never echoes it): .env/password-manager holds
  the only copy; rotation = overwrite assistant config + VPS env together.

## RECENT (last 5 landings, newest first)
- #31 worker CORS preflight before auth — console→worker browser calls unblocked — 2026-07-11
- #30 pg-boss webhook consumer — receiver enqueues, consumer drains; migration 015 — 2026-07-11
- #29 STATE refresh post-move; #28 CLOSED unmerged (duplicate of #21) — 2026-07-11
- #27 vapi spike local half (account verified, receiver 500→400, root dev script fixed) — 2026-07-11
- #26 migration 014 — vector + pg_trgm to `extensions` schema — 2026-07-11
