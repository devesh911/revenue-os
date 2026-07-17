PHASE: SETUP  <!-- D36: SETUP = speed (agents merge on green); LIVE = full force. Flip is Devesh-only, via docs/runbooks/go-live.md -->

# STATE — single source of truth for "where are we"

Overwrite, don't append. Update in the same PR as the work. Fresh sessions start here.
Task-level history + backlog live in **docs/sdlc.md** (the ledger; update it in the same PR too).
Updated: 2026-07-17 (task 22 — top-level AppErrorBoundary; render-time throws now show a reload card, not a blank page)

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
- **Console screens are REAL (task 15, 2026-07-13):** dashboard (six funnel tiles), task queue,
  live monitor, contacts all render org-scoped data via new screens API; task/conversation/contact
  rows deep-link to transcripts; seed packs now include demo contacts/conversations/messages/tasks/
  outcomes. Verified in a live browser against the seeded real_estate org. 80/80 tests.
- **Console boot is honest (task 16, this PR):** missing/empty VITE_SUPABASE_* renders a
  ConfigErrorScreen (names each var + apps/console/.env.example) instead of white-screening;
  OrgHome/OrgSwitcher show a distinct unreachable-API error state, separate from empty. +9
  env-free tests. **Task 21:** the mechanism is now a lazy memoized `getSupabase()` + a static
  `App` import; the off-static-graph invariant and the separate boot chunk are gone; the
  env-missing gate is preserved. **Task 22:** a top-level `AppErrorBoundary` now catches
  render-time throws anywhere in the App subtree — an honest reload card, not a blank page;
  the parseConsoleEnv→ConfigErrorScreen gate and lazy `getSupabase()` are unchanged.
- Operating contract: AGENTS.md (one page). Docs are reference; spec §12 + patterns/ load-bearing.
- Local stack: `supabase start`; imgproxy + pooler containers stopped is normal (unused locally).

## NEXT (top = take it; one task, one branch, one PR)
1. Staging deploy per runbook (task 14): GitHub side is ready (env + secrets verified); still
   needs the VPS box + Cloudflare Pages connect (WAITING) before arming deploy.yml.
2. Vapi spike REMOTE half (needs VPS public URL): real webhook delivery (S6.2 x-vapi-secret header
   confirm), real call, recorded payloads replace synthetic fixtures, India number decision (BYO SIP
   trunk — Exotel/Plivo; account has 0 numbers/credentials).
## IN FLIGHT
(nothing in flight — task-14b is gated, see WAITING)

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
- **Model routing v2 (2026-07-13, Devesh):** code and tests are authored by Opus 4.8 at effort max
  (worker + tester agent defs repinned from sonnet); security/RLS/migration/guard-critical RED moves
  to tester(opus) with mandatory orchestrator line-by-line test review before GREEN, superseding
  dev-workflow §4B self-authorship. New scribe agent (Sonnet, effort max) writes PR bodies/STATE.md/
  docs/sdlc.md ledger prose from the worker's DOCS DELTA; Fable orchestrator only assigns and reviews
  (git/PR mechanics excepted) and may summon new agent classes when defined ones don't fit (hard
  rails inherited). Supersedes the "Agent dispatch economy (2026-07-12)" entry's model choices (that
  entry stays in place).
- **SDLC ledger (2026-07-13, Devesh):** docs/sdlc.md is the per-task ledger (registry + ≤8-line
  detail blocks + doc map), updated in the same PR as the work. Division: STATE = "now",
  spec §12/§12b = original P0 contract + obligations, sdlc.md = task history and specced backlog.
- **Waves (Step-2 parallel, 2026-07-17):** independent file-disjoint tasks may build/test/review in
  PARALLEL, one worktree each under `.claude/worktrees/`, verifying env-free locally with CI as the
  verdict; landing stays serial (one PR at a time, base==main re-confirmed, WIP cap 3), ≤1 migration
  minter per wave, `STATE.md`/`docs/sdlc.md`/`lessons.md` exempt-shared. This supersedes
  dev-workflow §3's stacked-branch mechanics; the §3 doc amendment itself is a pending §13 item
  (docs/** is agent-denied). Mirrored into `.claude/skills/task-loop` + `.claude/agents/{worker,tester}`
  (this PR); full protocol in `orchestrator/.claude/commands/goal.md`.
- **D36 phased posture (2026-07-12, Devesh):** PHASE line above is the one truth. SETUP = agents
  merge independent PRs (squash) on observed-green + tested evidence; LIVE = ruleset-enforced
  human merges, full S13, monitoring on. Flip via docs/runbooks/go-live.md, Devesh-only. All
  SETUP-era secrets are treated as burned (rotation is a go-live step). Supersedes the ad-hoc
  autonomy-v2.1 wording; hard rails (secrets/tenancy/history/sends/webhooks/CI-anchor) are
  phase-independent. Guard/deny-list loosening stays Devesh-only in both phases.
- **#28 closed unmerged (2026-07-11):** the queued ".gitleaks.toml commit-scoping" task had already
  landed as #21; the re-execution would have regressed main (dropped the b207595 excusal). Queued
  tasks get checked against main before execution, not just against the queue.
- webhook_events is a lifecycle table: payload immutable, status/processed_at mutable.
- Extensions schema: DONE — migration 014 (#26) moved vector+pg_trgm to `extensions`; role
  search_path carries unqualified runtime access; migration DDL must qualify from now on.
- The T26.4 closed job-type set gains `webhook.process.vapi` (receiver-enqueued drain; RLS makes
  a cross-org sweep impossible for app_service, so the org id rides the job).
- **Agent dispatch economy (2026-07-12, Devesh):** worker/tester/scout agents now live in the
  main repo `.claude/agents/` (shim-based /goal sessions could never see the orchestrator/ copies
  — that's why usage was 100% Fable). Models: worker+tester=sonnet (downshifted from opus),
  scout=haiku; the main thread orchestrates/reviews only, routine RED/GREEN/recon is dispatched.
- **Six funnel metrics (task 15, 2026-07-13):** spec E says "6 metrics" without naming them; the
  boring derivable set shipped: new_leads · conversations_started · conversations_completed ·
  qualified (outcomes) · bookings (outcomes) · open_tasks, rolling 30-day window except open_tasks.
  Rename/re-cut freely when the pilot defines its success metric.
- bun-types stays pinned to the bun engine version (both 1.3.11).
- Cloudflare Bot Fight Mode stays OFF (S4.3 conflict): non-Enterprise BFM is zone-wide, no per-path
  skip, and would challenge Vapi webhooks (lost call events). Revisit when apps/www exists.
- Vapi `server.secret` is write-only at the API (GET never echoes it): .env/password-manager holds
  the only copy; rotation = overwrite assistant config + VPS env together.

## RECENT (last 5 landings, newest first)
- (this PR) console boot: top-level AppErrorBoundary wraps `<App/>` — render-time throws show an honest reload card (not a blank page); ConfigErrorScreen stays outside, parseConsoleEnv gate intact — 2026-07-17
- #53 console boot: lib/supabase → lazy memoized getSupabase(); main.tsx static App import; BootErrorScreen + dynamic-import invariant deleted (env gate preserved) — 2026-07-17
- #52 biome.json: recommended→preset:recommended (clear deprecation; ruleset verified intact) — 2026-07-17
- #51 main-repo mirror: Step-2 wave protocol into task-loop skill + worker/tester defs — 2026-07-17
- #50 Contacts rows deep-link to latest conversation transcript (screens API latest_conversation_id) — 2026-07-17
