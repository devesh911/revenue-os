PHASE: SETUP  <!-- D36: SETUP = speed (agents merge on green); LIVE = full force. Flip is Devesh-only, via docs/runbooks/go-live.md -->

# STATE — single source of truth for "where are we"

Overwrite, don't append. Update in the same PR as the work. Fresh sessions start here.
Task-level history + backlog live in **docs/sdlc.md** (the ledger; update it in the same PR too).
Updated: 2026-07-13 (SDLC ledger created — docs/sdlc.md)

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
  sshd, ufw 443/22-limit, fail2ban, Docker, 2GB swap, resized to 1vCPU/2GB/48GB). **Console is
  LIVE on Cloudflare Pages**: https://revenue-os-console.pages.dev (push-to-deploy on main; build
  env SKIP_DEPENDENCY_INSTALL=1 + BUN_VERSION=1.3.11 in BOTH prod+preview; VITE_ vars → staging
  Supabase `ajtfillmkjhoffxllqja`, Mumbai).
- **Staging data path PROVEN (2026-07-12 evening):** `scripts/provision-staging.sh` ran clean
  (app_service activated, VPS `.env` installed 600, pooler host aws-1 — #41); on-box verify:
  containerized psql as app_service → 33 public tables, then `pgboss,app` schemas after CI push.
  **CI `staging-migrations` GREEN** (token + DB password secrets fixed by Devesh; run 29191891317
  attempt 3): staging is at migration 015. Worker boot now waits ONLY on the domain.
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
- feat/task-15-console-screens-live-data: screens API + console live data — RED committed
  (cb55953: auth gate, M0 denial, six funnel metrics), GREEN in progress in the main tree.
- feat/sdlc-ledger (this PR): docs/sdlc.md — the SDLC task ledger.

## WAITING ON DEVESH
- **Domain purchase** — the ONLY blocker left for worker first-boot: Cloudflare zone (api DNS,
  Transform Rule, origin lockdown), Pages custom domain, Caddy cert, `docker compose up`, and the
  Vapi remote spike all execute the day it exists (runbook §4–§6).
- **CI deploy credentials** (classifier-blocked for agents; needed for task 14b image ship, not
  for migrations): generate + wire the staging SSH key,
  either by naming the action to an agent session or yourself:
  `ssh deploy@168.144.147.90 'ssh-keygen -q -t ed25519 -f ~/.ssh/ci_deploy -N "" && cat ~/.ssh/ci_deploy.pub >> ~/.ssh/authorized_keys && cat ~/.ssh/ci_deploy'` → `gh secret set STAGING_SSH_KEY --env staging` → delete `~/.ssh/ci_deploy` from the box.
- Vapi India telephony decision inputs: Exotel vs Plivo SIP trunk account (spec risk #4).
- Stale merged branches: agents are classifier-blocked from `git push origin --delete`; run flip-kit
  item 5 (orchestrator/state/FLIP-KIT-2026-07-11.md) or leave them.
- Optional: bot PAT for unattended orchestrator runs; interactive loops don't need it.

## DECISIONS (open forks; the noted default is what we build toward)
- **SDLC ledger (2026-07-13, Devesh):** docs/sdlc.md is the per-task ledger (registry + ≤8-line
  detail blocks + doc map), updated in the same PR as the work. Division: STATE = "now",
  spec §12/§12b = original P0 contract + obligations, sdlc.md = task history and specced backlog.
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
- #44 docs/sdlc.md — SDLC task ledger (registry, mini-specs, doc map) — 2026-07-13
- #40+#41 provision-staging.sh (zero hand-typed secrets; pooler host fix) — 2026-07-12
- #38+#39 task 14a: staging migrations ride CI (deploy.yml armed, CLI pinned 2.109.1) — 2026-07-12
- #37 worker/tester/scout agents in main repo — sonnet/sonnet/haiku, dispatch-don't-do — 2026-07-12
- #35+#36 VPS+Cloudflare runbook · STATE: VPS hardened, console live on Pages — 2026-07-12
