PHASE: SETUP  <!-- D36: SETUP = speed (agents merge on green); LIVE = full force. Flip is Devesh-only, via docs/runbooks/go-live.md -->

# STATE — single source of truth for "where are we"

Overwrite, don't append. Update in the same PR as the work. Fresh sessions start here.
Task-level history + backlog live in **docs/sdlc.md** (the ledger; update it in the same PR too).
Updated: 2026-07-31 (tasks 53+54 — memory wave Feed-2: write fold M1 + retrieval M2)

## NOW (verified facts, not hopes)
- **Memory retrieval live — M2 (task-54, 2026-07-31):** `retrieveMemories` + an S8.4-labeled memory
  block now wire into `assembleContext` — the harness barrel stays the one door. Recall is
  deterministic SQL (kind priority summary>preference>objection>fact then recency, live rows only)
  under a ≤800-token block budget that drops whole rows; delimiter-breakout defence is proven by
  hostile-row tests. DB tier (real ordering, superseded filter, cross-tenant denial) ran green
  locally against the local stack; CI `checks` is the verdict.
- **Calls now leave a memory (task-53, Feed-2 M1, 2026-07-31):** the Vapi `end-of-call-report`
  branch folds the call summary into `contact_memories` in the same transaction that completes the
  conversation — verbatim content, `kind='summary'`, `embedding` NULL; the previous live summary
  per contact is superseded via `superseded_by` (append-only, per-contact lineage). No contact or
  empty summary → silent skip (event still `processed`); no migration (006 already ships the
  table). Real-DB suite memory-write.test.ts (8 tests) is CI-owned.
- **Settings Guardrails live on real data (task 52, 2026-07-30):** `GET`/`PUT
  /orgs/:orgId/guardrail-policies` (GET any member, PUT admin-only S1.7) share one
  `GuardrailPolicyInputSchema` — the strict-Zod boundary parsed by both the worker route and the
  console mutation, protecting the harness quiet-hours hook's FAIL-OPEN `guardrail_policies.config`
  read (a malformed config is a 400 with nothing written, not a silently-disabled gate). Settings
  Guardrails section is live: quiet_hours + autonomy editable, attempt_caps + dnc read-only. Real-DB
  route suite (401/403 lattice, round-trips, 400-nothing-written) is CI-owned.
- **Console AgentsPage live on real data (task-50, 2026-07-30):** new `GET /orgs/:orgId/agents`
  (validate→authorize→do; `memberRole`→403; lean `{agents, workflows}` payload, S5.8 — no
  system_prompt/voice_config/language_config/tools_allowed/definition on the wire) backed by
  `packages/db`'s `listAgentsAndWorkflows`; `AgentsPage` now renders both lists via `useAgentsQuery`
  + the DataShell/Table suite, retiring the "endpoint isn't live" placeholder (honest empty state:
  "No agents or workflows configured yet."). Real-DB suite (401/403/cross-tenant-denial/lean-shape/
  ordering) is CI-owned.
- **Analytics "Trends" live on real data (2026-07-30, task-51):** `GET /orgs/:orgId/metrics/trends`
  returns a gap-filled 30-day daily series (new_leads/conversations_started/bookings) via new
  `funnelTrends` (`packages/db/src/screens.ts`, `withOrg`); console Analytics page's Trends section
  now renders it (`useTrendsQuery` → per-series CSS bar tracks through `DataShell`), retiring the
  "Time-series trends arrive with the analytics API." placeholder. Env-free gates green (typecheck/
  lint/118 console tests); the real-DB tenancy suite `services/worker/test/metrics-trends-api.test.ts`
  is CI-owned — CI `checks` is the verdict. @1bf1ccb.
- **M2 acceptance replay GREEN — durable agentic lifecycle proven end-to-end (2026-07-27,
  T9/task-49):** `m2-replay.test.ts` drives the real `scheduler.tick` + T7 job handlers through a
  deterministic multi-day replay — call_1→no_answer→wait 2h→WhatsApp→wait_until 11:00→call_2→booked
  — over a SimClock with FakeVoice/FakeWa/fake-LLM providers (CI-owned real-DB; CI `checks` is the
  M2 verdict). Landing closed two integration gaps: `site_visit_booked` outcomes now attribute to
  the run (conversationId threaded OrgCtx→runTurn→book_appointment, `outcomes.conversation_id →
  conversations.workflow_run_id`, moat #4); completed runs now rest at `current_step='end'`
  (`scheduler.applyTransitions`). T8-H2 closed (jobs.ts now imports the `@revenue-os/harness`
  barrel). Env-free gates green (typecheck/lint/tools/full-harness/wiring-unit); m2-replay/
  scheduler/wiring-jobs suites are CI-owned. @b00d0f2 + @bae1f37.
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
1. Guardrail hooks — dnc/attempt-caps/spend-caps (task 25 follow-on, spec §12, moat invariant #4):
   wire into `packages/harness` `defaultPipeline` alongside `autonomyHook`/`quietHoursHook`. DNC
   must fail closed (hard-safety) — opposite of quiet-hours' fail-open posture (see DECISIONS).
2. Activate the guardrail hooks — wire `action.channel` + `contactId` at the send call site
   (`packages/channels` / `loop.ts`) so quiet-hours (and dnc/attempt-caps) actually fire; fix the
   latent tz `'contact'` + missing-`contactId` path to fail OPEN (not default `Asia/Kolkata`);
   handle/document `start === end` as a no-op window. (Surfaced by code-review on #57.)
3. Staging deploy per runbook (task 14): GitHub side is ready (env + secrets verified); still
   needs the VPS box + Cloudflare Pages connect (WAITING) before arming deploy.yml.
4. Vapi spike REMOTE half (needs VPS public URL): real webhook delivery (S6.2 x-vapi-secret header
   confirm), real call, recorded payloads replace synthetic fixtures, India number decision (BYO SIP
   trunk — Exotel/Plivo; account has 0 numbers/credentials).
5. ~~Wire apps/www into the root typecheck script~~ — DONE in this PR (#87 @48881df; review round 1).
   type-clean manually).
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
- **Memory-write newest-wins supersede (task-53, 2026-07-31):** a duplicate `end-of-call-report`
  under a DISTINCT provider event id supersedes the prior live summary, not a dedupe — newest wins.
  Exact replays die at the receiver's `dedupe_key` first, so drained/duplicate events never re-fold.
- **Memory-write skip-on-null-contact posture (task-53, 2026-07-31):** inbound conversations carry
  `contact_id` null until contact resolution exists — skipping the memory fold is their normal path,
  not an error; memory fires on workflow-placed (outbound) calls only, today.
- **apps/www zero-dep reframe (task-34, 2026-07-31):** Devesh redefined zero-dep for apps/www as
  "no backend connectivity" (no API calls, no secrets) — not "no build tooling." Reframes the
  task-26 zero-dep decision; does not reverse it. Build tooling (react/vite/tailwind) is allowed
  and now used.
- **apps/www stack = console's stack, not Astro (task-34, 2026-07-31):** componentization reuses
  react/react-dom/vite/@vitejs/plugin-react/tailwindcss/@tailwindcss/vite — already-approved
  tech-stack.md §T24 pins, zero new BOM row. Further retires the README's week-3 Astro reservation
  (task-26 already superseded it once) rather than reviving it — Astro would need a new BOM row via
  the agent-denied docs/tech-stack.md path.
- **Per-app biome.json convention extended to apps/www (task-34, 2026-07-31):** apps/www/biome.json
  now mirrors apps/console/biome.json exactly (root:false, extends "//", css.parser.tailwindDirectives:true)
  so Biome parses the Tailwind v4 @theme/@utility rules — the same mechanism as the console
  design-system decision below, now standing convention for any Tailwind-v4 app in this monorepo.
- **Memory retrieval posture (task-54, 2026-07-31):** deterministic SQL — kind priority
  (summary>preference>objection>fact) then recency, live rows only — is the retrieval mechanism now;
  embeddings/semantic recall are deferred to the Voyage-gated M4 per the accepted phased design. The
  ≤800-token budget drops whole rows, and the S8.4 frame renders next to the budget math so the cap
  is measured on the real block.
- **Guardrail-policies config decisions (task 52, 2026-07-30):** `attempt_caps` is a `strictObject`
  with optional `voice`/`whatsapp` keys — strict rejects unknown channels, optional lets an org cap
  just one channel; a missing channel means no cap, by design. One `GuardrailPolicyInputSchema`
  union is the only config boundary — declared once in `packages/shared`, parsed by the worker route
  AND the console mutation, never re-declared (boundary truth T11). GET envelope is a lean 4 columns
  (`key, config, active, updated_at`) — no `id`/`org_id` on the wire (S5.8). Submit→PUT click-path
  coverage is deferred to the P3 Playwright smoke — console suites are env-free SSR, so the path
  stays source-pinned (`useMutation` + PUT + `invalidateQueries` + shared-schema parse) until then.
- **Task-50 agents-list scope (2026-07-30):** the explicit `org_id = $1` filter in
  `listAgentsAndWorkflows` is the drizzle-query.md belt-and-suspenders convention and deliberately
  EXCLUDES global-template rows (`org_id IS NULL`, member-readable under RLS per migration 006);
  templates stay unlisted until a product need exists.
- **Analytics trends query posture (2026-07-30, task-51):** `funnelTrends` adds an explicit
  `org_id = $1` predicate to every series (drizzle-query.md belt-and-suspenders) where
  `funnelMetrics` omits it — `withOrg` RLS stays the net, tile↔trend agreement unaffected; gap-fill
  uses `generate_series(0, 29)` integer offsets, not a date/timestamp series, to sidestep Postgres
  function-resolution ambiguity.
- **T6 scheduler DB-error policy (2026-07-25):** a failed inline write rolls the per-run tx back and leaves the run 'waiting' (retried); only interpret-throws dead-letter to 'failed'. tick() catches per-run and continues so one bad run never aborts the tick — required because the RED suite ticks without .catch and a rolled-back poison run stays due.
- **Attempt-cap DB-outage posture (2026-07-25):** fail-CLOSED (block on read error), matching its hard-safety class alongside DNC (STATE quiet-hours-vs-DNC posture note). No test pins it; revisit if a courtesy-gate (fail-open) posture is later preferred.
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
  Now a token-based multi-file static layer as of task-29 — still zero-dep, no framework.
- PR #69 review finding 'hairline tokens via --cream-rgb' DROPPED — AC-7's literal-rgba pins are the
  stronger visual-parity guard; the literal duplication is faithful to the export (Fable ruling,
  2026-07-24).
- DataShell/Table adoption keeps the title cell as `<TD className="font-medium text-ink">` (cx-concat
  over the primitive's baked `text-ink-soft`), matching the Contacts title-cell idiom — design-system
  detail, not test-pinned.
- **Workflow `tool` step → Action mapping (2026-07-25, T1):** `book_appointment` maps to a `write_outcome` action (kind `site_visit_booked`, a db-design outcome kind); `create_task` maps to `create_task`. Boring closed-set mapping; the M2 replay keys on the booked OUTCOME row (the appointments-table row comes from the real in-call book tool, out of the pure-spine scope).
- T4: all three production tools autonomy:"auto" — M2 requires autonomous site-visit booking; send-safety is enforced at the guarded channels doorway (moat #4), not a per-tool approval gate; the writes are reversible/low-stakes. An "approval" tier would route every booking/send to a human task (loop.ts) and break autonomous operation.
- T4: contactId validated with z.guid() (UUID shape) not z.string().uuid() — Zod 4.4.3 enforces RFC-9562 version/variant nibbles that non-real fixtures fail; RLS + the contacts FK are the real identity guarantee.
- T7: call disposition arrives via an injected OutcomePort — swappable for T9 FakeVoice / production end-of-call report; not baked into the voice result.
- T7: state.lastDisposition lifecycle — folded by place_call after the turn (run re-armed, current_step unchanged); cleared by the scheduler when a run advances out of a routing step (call re-entry / branch), in BOTH the in-memory walk and the persisted state.
- T7: send_wa vars merge — run/contact state.vars OVERRIDE step template vars on key collision ({...action.vars, ...state.vars}).
- T7: @revenue-os/channels added to the worker as an internal workspace:* dep with NO BOM row (T6 @revenue-os/harness precedent).
- T7: handler idempotency markers — place_call via run reload (lastDisposition/status/step-kind); send_wa via a durable wa_message usage row keyed send_wa:runId:template; run_agent_turn via a per-trigger message-derived marker (not conversation status). Robust step-in-payload hardening is a tracked P1 (CLEANUP-LEDGER T7-H4).
- T8: makeProvider returns the provider instance (or null), not a registry entry — the caller injects it straight into handler deps.
- T8: scheduler tick scheduled as a durable pg-boss cron (pgboss.schedule) over a per-process setInterval — survives restarts; cadence 1 min (pg-boss cron min granularity) vs the plan's 30s, acceptable for day-scale runs.
- T8: live-telephony senders + call-outcome port + confirmation-send seam + no-key LLM provider are throwing stubs (fail loud, boot green); T9 swaps in the real/Fake adapters.
- T8: cross-tenant tick org discovery is RLS-ceilinged (a bare pool read returns nothing under app_service) — production-hardening deferred to CLEANUP-LEDGER T8-H; the M2 replay drives tick() per-org directly.

## RECENT (last 5 landings, newest first)
- (this PR) task-54 memory-retrieval M2 (S8.4 labeled block) — 2026-07-31
- #88 task-53 memory-write M1 (contact_memories fold) — 2026-07-31
- (this PR) task-34 wave-8 — www componentized: react+vite+tailwind v4 (console's exact stack, ZERO new deps — T24-approved pins; retires the week-3 Astro reservation); `src/design` (6 primitives) + `src/sections` (9) + `src/content` (5 typed modules) separation; `@theme` owns all tokens+fonts; Pricing/Faq interactivity via `useState` with the same `data-*` hooks; old `styles/*.css` deleted; 95/95 new suite (copy-parity SSR + architecture + build gate) + console 139/0 + tests/ 49/0, typecheck+lint clean. — 2026-07-31
- (this PR) T9/task-49 — M2 REPLAY (the acceptance gate): deterministic multi-day lifecycle GREEN on a SimClock + synthetic providers; two integration gaps fixed (booking outcome run-attributed via conversation_id; completed runs rest at current_step='end'); T8-H2 barrel closed. @b00d0f2 + @bae1f37. — 2026-07-27
- (this PR) T8 (task-48) GREEN @c8b2b9f — worker production boot wired: action queues (policy 'short') + call.post dead-letter, 4 T7 handlers via boss.work, durable pg-boss scheduler.tick; ANTHROPIC_API_KEY optional, makeProvider gates the Claude provider (null ⇒ boot still green). wiring-unit 3/3, wiring-jobs CI-owned. — 2026-07-27
