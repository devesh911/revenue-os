PHASE: SETUP  <!-- D36: SETUP = speed (agents merge on green); LIVE = full force. Flip is Devesh-only, via docs/runbooks/go-live.md -->

# STATE — single source of truth for "where are we"

Overwrite, don't append. Update in the same PR as the work. Fresh sessions start here.
Task-level history + backlog live in **docs/sdlc.md** (the ledger; update it in the same PR too).
Updated: 2026-07-23 (staging worker first-boot via tunnel stopgap — deployed console functional)

## NOW (verified facts, not hopes)
- **Staging worker first boot (2026-07-23, tunnel stopgap — no PR pipeline, ops only):** worker
  container runs on the VPS (168.144.147.90), source rsync'd to `~/app` (provisioning skipped the
  clone), via `docker compose` + a tunnel override (8080→box localhost only, Caddy not started).
  HTTPS = Cloudflare QUICK TUNNEL in tmux (https://expense-reveal-founder-vip.trycloudflare.com) —
  EPHEMERAL (dies on cloudflared restart, needs Pages VITE_API_URL re-set + console rebuild after)
  and bypasses edge lockdown (X-Edge-Auth), demo-only. Pages VITE_API_URL is now SET + console
  rebuilt: deployed console functional end-to-end for the first time (login, org switcher work).
  First API writes hit staging (validate→authorize→write, RLS): org 67e8c293 + 5 contacts via CSV
  import (`{created:5,merged:0,invalid:0}`), verified live in browser. Tasks/Conversations/Analytics
  stay empty by design, pending the console backend wave.
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
- **Console boot is honest (task 16, #49):** missing/empty VITE_SUPABASE_* renders a
  ConfigErrorScreen (names each var + apps/console/.env.example) instead of white-screening;
  OrgHome/OrgSwitcher show a distinct unreachable-API error state, separate from empty. +9
  env-free tests. **Task 21:** the mechanism is now a lazy memoized `getSupabase()` + a static
  `App` import; the off-static-graph invariant and the separate boot chunk are gone; the
  env-missing gate is preserved. **Task 22:** a top-level `AppErrorBoundary` now catches
  render-time throws anywhere in the App subtree — an honest reload card, not a blank page;
  the parseConsoleEnv→ConfigErrorScreen gate and lazy `getSupabase()` are unchanged. **Task 24:**
  `VITE_API_URL` — the one still-unvalidated var #53's review flagged — is now required as a
  valid URL in PROD (optional in dev) via `parseConsoleEnv`; VITE_SUPABASE_* rules unchanged.
- **§12b Playwright-smoke obligation (2026-07-17):** harness skeleton scaffolded — config
  (`apps/console/playwright.config.ts`) + boot-honesty smoke (`apps/console/e2e/smoke.e2e.ts`),
  wiring proven by `bun run e2e -- --list`; full four-screen runtime smoke still deferred to P3;
  runtime run needs only `bunx playwright install` locally, CI arming is the follow-up.
- **Quiet-hours guardrail hook (task 25, #57):** The quiet-hours hook is implemented and wired
  into `defaultPipeline`; it gates any send that carries a `channel`. BUT the current send path
  (`runTurn` in `packages/harness/src/loop.ts`) does not yet populate `action.channel`, so the gate
  is **inert in production** until `packages/channels` (P2) constructs channel-bearing actions. The
  hook is correct and tested (harness 29/29), not yet triggered end-to-end.
- **Operator console styled (design system + 8 pages) — 2026-07-18:** foundation (#58) shipped
  Tailwind v4 `@theme` tokens (warm-neutral palette + one gold accent, radii, shadows, type scale),
  `ui/primitives/` (pill Button/IconButton, Input, Textarea, Card, Badge, Chip, Avatar), a 12-icon
  hand-authored inline-SVG set (no icon package), `ui/layout/` AppShell (240px sidebar + grouped nav
  + user chip, topbar pill actions) + PageHeader/Section, the `src/routes.tsx` MANIFEST feeding both
  Sidebar and router, Home (hero + ask bar + suggestion chips + recent-conversation cards) as the new
  `/` landing, and `ui/README.md` as the fleet contract. 6 fan-out pages then composed on it, each
  its own serial-merged PR: Conversations/live-monitor #59, Contacts #60, Analytics #61 (metrics
  cards; label Dashboard→Analytics, path kept `dashboard`), Tasks #62, Agents #63, Settings #64 —
  all compose `ui/` primitives + tokens; the test-pinned `screens/*` files stayed byte-identical.
  Data-thin pages are honest shells pending backend routes: Agents (no `/agents` console API) and
  Settings (no guardrail-config API) render truthful empty states, not fabricated data. All 8 pages
  now styled: Home, Tasks, Conversations, Contacts, Analytics, Transcript, Agents, Settings.
- Operating contract: AGENTS.md (one page). Docs are reference; spec §12 + patterns/ load-bearing.
- Local stack: `supabase start`; imgproxy + pooler containers stopped is normal (unused locally).

## NEXT (top = take it; one task, one branch, one PR)
1. Console backend wave — 3 worker routes + Zod console hooks to light up the styled shells left by
   the page-fleet fan-out (#58–#64): `GET /orgs/:orgId/agents` (agents/workflows list) → wire
   AgentsPage; an analytics-trends endpoint → wire the Analytics "Trends" section; `GET`/`PUT
   /orgs/:orgId/guardrail-policies` (quiet-hours + autonomy config) → wire Settings "Guardrails".
2. Console cleanup — retire the now-unrouted but test-pinned `screens/*` (LiveMonitor/TaskQueue/
   ContactTimeline/ContactsTable) and re-skin `ConversationLink`'s pinned `text-blue-600` link to
   the gold accent — both need coordinated edits to `tests/conversation-link.test.tsx` /
   `tests/console-contact-links.test.tsx` in the same PR.
3. Guardrail hooks — dnc/attempt-caps/spend-caps (task 25 follow-on, spec §12, moat invariant #4):
   wire into `packages/harness` `defaultPipeline` alongside `autonomyHook`/`quietHoursHook`. DNC
   must fail closed (hard-safety) — opposite of quiet-hours' fail-open posture (see DECISIONS).
4. Activate the guardrail hooks — wire `action.channel` + `contactId` at the send call site
   (`packages/channels` / `loop.ts`) so quiet-hours (and dnc/attempt-caps) actually fire; fix the
   latent tz `'contact'` + missing-`contactId` path to fail OPEN (not default `Asia/Kolkata`);
   handle/document `start === end` as a no-op window. (Surfaced by code-review on #57.)
5. Staging deploy per runbook (task 14): GitHub side is ready (env + secrets verified); still
   needs the VPS box + Cloudflare Pages connect (WAITING) before arming deploy.yml.
6. Vapi spike REMOTE half (needs VPS public URL): real webhook delivery (S6.2 x-vapi-secret header
   confirm), real call, recorded payloads replace synthetic fixtures, India number decision (BYO SIP
   trunk — Exotel/Plivo; account has 0 numbers/credentials).
## IN FLIGHT
(nothing in flight — task-14b is gated, see WAITING)

## WAITING ON DEVESH
- **Domain purchase** — the ONLY blocker left for the PERMANENT worker deploy: Cloudflare zone (api DNS,
  Transform Rule, origin lockdown), Pages custom domain, Caddy cert, `docker compose up`, and the
  Vapi remote spike all execute the day it exists (runbook §4–§6). Tunnel stopgap is live meanwhile
  (ephemeral URL; Pages re-pairing needed on every cloudflared restart).
- **CI deploy credentials** (classifier-blocked for agents; needed for task 14b image ship, not
  for migrations): generate + wire the staging SSH key,
  either by naming the action to an agent session or yourself:
  `ssh deploy@168.144.147.90 'ssh-keygen -q -t ed25519 -f ~/.ssh/ci_deploy -N "" && cat ~/.ssh/ci_deploy.pub >> ~/.ssh/authorized_keys && cat ~/.ssh/ci_deploy'` → `gh secret set STAGING_SSH_KEY --env staging` → delete `~/.ssh/ci_deploy` from the box.
- Vapi India telephony decision inputs: Exotel vs Plivo SIP trunk account (spec risk #4).
- Stale merged branches: agents are classifier-blocked from `git push origin --delete`; run flip-kit
  item 5 (orchestrator/state/FLIP-KIT-2026-07-11.md) or leave them.
- Optional: bot PAT for unattended orchestrator runs; interactive loops don't need it.

## DECISIONS (open forks; the noted default is what we build toward)
- **Console design system (2026-07-18):** console adopts a Bland-style design system — `@theme`
  tokens, `ui/` primitives, `routes.tsx` manifest as the single nav/router source; `screens/*` stay
  path-pinned with `pages/*` as route surfaces until tests move; nested `apps/console/biome.json`
  enables `tailwindDirectives`; `/` lands on Home.
- **Console fan-out PR strategy (2026-07-18):** the 6-page fan-out shipped as 6 code-only PRs
  (#59–#64) plus this one consolidating wave-end docs PR, rather than each page PR touching
  `STATE.md`/`docs/sdlc.md` — avoids 6× exempt-shared churn during parallel merges (see the Waves
  decision below). Analytics kept its route path `dashboard` (label-only rename to "Analytics") to
  preserve Home's "Check performance" chip deep-link.
- **Quiet-hours guardrail posture (task 25, 2026-07-18):** the quiet-hours hook is deliberately
  fail-open (courtesy gate) — a missing/malformed policy row or a DB read error passes the send
  rather than blocking all outbound traffic on one bad read. The future DNC hook is hard-safety and
  will be fail-**closed** — opposite posture, do not copy this one.
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
- **apps/www is zero-dep static HTML (task 26, 2026-07-18):** supersedes the README week-3 Astro
  reservation — Astro is agent-blocked by the BOM rail (new deps need docs/tech-stack.md rows,
  agent-denied); a one-page landing needs no framework. Revisit only if the site grows multi-page.

## RECENT (last 5 landings, newest first)
- (this PR) staging worker FIRST BOOT via Cloudflare quick tunnel — deployed console functional end-to-end; first API writes to staging (org 67e8c293 + 5 contacts via CSV import) — 2026-07-23
- #66 apps/www static zero-dep landing page — single index.html (copy/data baked: 3 plans/4 stages/3 moats/5 FAQs), 32 self-hosted fonts (Playfair/Lora/IBM Plex Mono), SVG-noise texture, one inline script (plan-select + FAQ accordion); + review round 1 (selected-plan CTA box-sizing so it's flush to its column; near-black underlay behind the tint panels); 35/35 landing tests — 2026-07-21
- #48 chore/playwright-smoke — Playwright e2e smoke scaffold (harness skeleton; locally runnable after browser install) — 2026-07-21
- #56 VITE_API_URL now validated in prod by parseConsoleEnv (required valid URL in PROD, optional in dev) — boot-honesty arc closed — 2026-07-21
- console page-fleet fan-out — 6 pages styled on the design-system foundation: Conversations/live-monitor #59, Contacts #60, Analytics #61 (label Dashboard→Analytics, path kept `dashboard`), Tasks #62, Agents #63, Settings #64; Agents/Settings are honest empty-state shells (no backend API yet); all 8 console pages now styled — 2026-07-18
