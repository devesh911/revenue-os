# SDLC — the task ledger

One file = full task visibility. Load THIS for "what happened / what's next at the task level";
load `../STATE.md` for "where are we right now". Everything else is linked, not restated.

**Maintenance rule (same as STATE.md): update in the same PR as the work.** Per task that means:
flip the registry row, write/refresh its detail block (≤8 lines), move it between sections. Statuses
are overwritten; task rows are never deleted (history is the point). New work enters as a QUEUED
block *before* implementation starts — the block is the mini-spec.

Legend: ✅ done · 🔨 in flight · ⏳ queued · 🚧 gated (waiting on Devesh / external) · phases per
[project-spec §5](project-spec.md).

---

## 1. Task registry

### Numbered tasks (spec §12 backlog + successors)

| # | Task | Phase | Status | PR(s) | Residual / gate |
|---|---|---|---|---|---|
| 1 | Scaffold monorepo + CI green | P0 | ✅ | #2 | — |
| 2 | Migrations 000–009, full RLS | P0 | ✅ | #3 | — |
| 3 | `packages/db` app_service client + denial suite | P0 | ✅ | #4 | — |
| 4 | Auth + org bootstrap (M0 isolation) | P0 | ✅ | #5 | — |
| 5 | Vertical seed packs + loader | P0 | ✅ | #6 | — |
| 6 | Audit emitter + audited sample mutation | P0 | ✅ | #7 | — |
| 7 | `packages/harness` skeleton (T26) | P0 | ✅ | #8 | — |
| 8 | Vapi spike — webhook → conversations/messages | P1 | 🚧 | #9, #27 | remote half: domain + real call |
| 9 | Contact CSV import with merge dedupe | P0 | ✅ | #10 | — |
| 10 | Console shell (auth guard, org switcher, 4 screens) | P0 | ✅ | #11 | — (Pages deploy landed 2026-07-12) |
| 11 | CI parity with T14/S12.1 (audit, guards, dist scan, image build) | P0+ | ✅ | #19 | — |
| 12 | Org-scope the importContacts merge-update (audit F1) | P0+ | ✅ | #17 | — |
| 13 | Pipeline hardening (dockerignore, SHA pins, honest deploy status) | P0+ | ✅ | #23 | — |
| 14 | Staging deploy pipeline (a: migrations · b: image ship) | P2 | 🔨 | #38, #39 | 14b gated: domain + STAGING_SSH_KEY |
| 15 | Console screens live data (screens API, six funnel metrics) | P3 | ✅ | #43 | — |
| 16 | Console boot honesty (env gate + error-vs-empty states) | P3 | ✅ | (this PR) | — |

### Non-numbered engineering work

| Work | Status | PR(s) | Detail |
|---|---|---|---|
| P0 recovery — re-land tasks 3–10 after stacked-merge race | ✅ | #15 | §5 |
| Migration 013 — supabase advisors hardening | ✅ | #20 | §5 |
| Migration 014 — vector/pg_trgm → `extensions` schema | ✅ | #26 | §5 |
| Migration 015 + pg-boss webhook consumer | ✅ | #30 | §5 |
| Gitleaks allowlist commit-scoping | ✅ | #21 (#28 closed dup) | §5 |
| Transcript UI + S7.1 XSS render test (closed last S12.1 control) | ✅ | #25 | §5 |
| Worker CORS preflight fix (console→worker browser-dead) | ✅ | #31 | §5 |
| Operating model v2 (one-page contract, STATE.md, honest gates) | ✅ | #22 | §5 |
| D36 phased posture SETUP→LIVE + go-live runbook | ✅ | #34 | §5 |
| Skills: six doc-routers + harness-agent + learned-since stanzas | ✅ | #18, #32, #33 | §5 |
| worker/tester/scout agents in main repo (dispatch economy) | ✅ | #37 | §5 |
| provision-staging.sh (zero hand-typed secrets) | ✅ | #40, #41 | §5 |
| docs-reconciliation (9 contradictions settled + hygiene runbook) | ✅ | #46 | §4 |
| P3 polish — transcript links (Contacts deep-links) | ✅ | (this PR) | §5 |
| ADRs D31–D36 | ✅ | #12–#14, #16, #34 | [docs/decisions/](decisions/) |
| Playwright smoke scaffold (e2e harness skeleton) | 🚧 | (this PR) | BOM row (Devesh) + local run needs only `bunx playwright install`; CI arming follow-up |

### Read-only goals (no PR — findings in lessons.md)

| Goal | Date | Outcome |
|---|---|---|
| task-00 orchestrator smoke (#1, closed by design) | 07-10 | Mode B loop verified end-to-end |
| audit-db-schema | 07-11 | A1–A5 PASS; spawned task 12 + §13 candidates |
| audit-cicd-pipeline | 07-11 | 5/6 S12.1 scorecard; spawned task 13 + .dockerignore |
| demo-harness-local | 07-11 | one T26.5 turn against seeded org, real rows |
| VPS + Cloudflare infra day (runbook PR #35) | 07-12 | VPS hardened · console LIVE on Pages · staging pipeline green |

---

## 2. In flight

### task 14b — image ship to VPS 🚧
- **Goal:** deploy.yml builds the worker image, ships to the VPS, `docker compose up`, Playwright smoke (T22, dev-workflow §10).
- **Done half (14a, #38/#39):** `staging-migrations` job runs on every main push; staging DB at migration 015, verified on-box.
- **Gates:** domain purchase (Devesh) + `STAGING_SSH_KEY` env secret (command ready in STATE WAITING).
- **Docs:** [runbooks/vps-cloudflare-setup §4–§6](runbooks/vps-cloudflare-setup.md) · [tech-stack T14/T22](tech-stack.md).

### Playwright smoke scaffold (e2e harness skeleton) 🚧
- **Goal:** §12b e2e obligation (T12 layer 6) — Playwright smoke harness for the four console screens.
- **Shape:** `apps/console/playwright.config.ts` + `apps/console/e2e/smoke.e2e.ts` (Playwright `testMatch: "**/*.e2e.ts"` — specs live outside bun's `.test`/`.spec` glob); `@playwright/test` exact-pinned (G2).
- **Verified:** `bun run e2e -- --list` (+ typecheck, lint — all green).
- **Residual:** tech-stack T24 BOM row (Devesh); (a) browser install is the sole runtime prereq — `bun run e2e` needs no `.env`; (b) e2e specs sit outside `tsc` scope by design (`--list` is their gate), a dedicated e2e tsconfig rides the CI-arming follow-up.
- **Docs:** [tech-stack T12/T22/T24](tech-stack.md).

---

## 3. Queued (each block is the mini-spec; top of STATE NEXT wins)

### Vapi spike — remote half (task 8 residual) 🚧 P1/M1
- Real webhook delivery to the VPS URL (S6.2 `x-vapi-secret` confirm on RAW body) · real call
  transcribed · recorded payloads replace synthetic fixtures · India number decision (BYO SIP
  trunk, Exotel vs Plivo — spec risk #4, Devesh's account fork).
- Gate: domain + worker first-boot. Docs: [security S6](security.md) · [tech-stack T10](tech-stack.md) · worker-webhook skill.

### Worker first-boot on VPS 🚧 (domain day — runbook §4–§6)
- Cloudflare zone (api DNS, Transform Rule w/ EDGE_SHARED_SECRET, origin lockdown) · Pages custom
  domain · Caddy cert · `docker compose up` · smoke. All steps scripted in
  [runbooks/vps-cloudflare-setup](runbooks/vps-cloudflare-setup.md); .env already installed on-box (0600).

### Deferred-by-phase obligations (spec §12b is the authority)
- Playwright smoke over the four screens (T12 layer 6) — harness skeleton scaffolded (this PR);
  full four-screen runtime smoke still deferred to P3 + CI arming.
- Go-live flip SETUP→LIVE (D36): secret rotation, ruleset re-arm, monitoring —
  [runbooks/go-live](runbooks/go-live.md), **Devesh-only**.

Product roadmap beyond these: [project-spec §5](project-spec.md) (P1 talking demo → P2 workflow
spine → P3 operator surface → P4 pilot). New tasks are derived from there + §12b, specced here first.

---

## 4. Completed-task detail blocks

### task 1 — scaffold + CI green (#2)
Bun workspaces per spec §7; pinned bun 1.3.11 everywhere (G2); CI = Biome (G1) + typecheck +
bun test + rls_coverage + gitleaks; `checks` workflow observed green on a real PR (S13.7).

### task 2 — migrations 000–009 (#3)
Verbatim from [db-design §3–§8 + §14](db-design.md), one file per section; `supabase db reset`
clean; every table RLS-on (`bun run rls:check`). Later hardening: 010 (#4) · 011 (#5) · 012 (#9) ·
013 (#20) · 014 (#26) · 015 (#30). Migrations are append-only — see db-work skill before touching.

### task 3 — app_service client + denial suite (#4)
`packages/db` wrapper opens tx + `set_config('request.org_id', …)`; cross-org read proven to fail
(orchestrator-authored RED — security-critical). Bootstrap mechanics: [D31](decisions/D31-app-service-role-bootstrap.md).
This is hard rail #3 — ALL app DB access goes through it.

### task 4 — auth + org bootstrap (#5)
Create org / invite / roles on Supabase Auth, JWKS/ES256 server-side verify (T9); M0 check: two
tenants fully isolated. Migration 011 app-functions. Docs: [security S1](security.md).

### task 5 — seed packs + loader (#6)
`bun db:seed real_estate | b2b_wholesale`; dispositions/pipelines/guardrails/agent-v1 rows per
[db-design §9–§10](db-design.md) (two pilots, one schema).

### task 6 — audit emitter (#7)
`audit()` middleware, before/after capture, proven on audited PATCH /orgs. Outcomes/audit are
append-only rows — never status strings.

### task 7 — harness skeleton (#8)
Tool registry + policy-hook interface + fake LLM in tests; loop runs a scripted tool call. The
full spec is [tech-stack T26.1–T26.8](tech-stack.md) — load the harness-agent skill before touching.
Live demo driver: `packages/harness/demo-harness.ts` (#33).

### task 8 — Vapi webhook path (#9 + #27, remote half open)
Receiver verifies signature on RAW body, inserts `webhook_events` (dedupe_key), returns fast;
processor upserts by provider_ref, orders by messages.seq (out-of-order doctrine, [security S6](security.md)).
#27 verified the account + fixed receiver 500→400. #30 moved processing onto pg-boss.
`webhook_events` is a lifecycle table: payload immutable, status/processed_at mutable.

### task 9 — CSV import (#10)
Upload → identities → dedupe on (org, phone), duplicates merge; phones E.164-normalized BEFORE
insert. Hardened by task 12 (#17): org_id in the merge-update where-clause (defense-in-depth).

### task 10 — console shell (#11)
Auth guard, org switcher, four empty screens routed (Vite SPA, T3). Deploy residual closed
2026-07-12: LIVE at https://revenue-os-console.pages.dev (push-to-deploy on main; Pages build needs
SKIP_DEPENDENCY_INSTALL=1 + BUN_VERSION=1.3.11). Frontend rails: [security S7](security.md).

### task 11 — CI parity (#19)
T14/S12.1 delta: `bun audit` per PR · `scripts/guards.sh` (S1.2 service-role grep, S7.3
secret-shaped dist scan) · docker image build per PR (build only). Obligation table: spec §12b.

### task 12 — contacts org-scope (#17)
One-line + test: org_id added to the importContacts merge-update where-clause. Born from
audit-db-schema finding F1.

### task 13 — pipeline hardening (#23)
.dockerignore (deny-all allowlist — .env/.git out of build context) · SHA-pinned Actions · exact-pin
caddy 2.11.4 · deploy.yml permissions/concurrency + false-green stubs neutralized · ci.yml fail-fast.
Born from audit-cicd-pipeline.

### task 14a — staging migrations ride CI (#38, #39)
deploy.yml `staging-migrations` on every main push (supabase CLI pinned 2.109.1); manual db push
retired. Staging verified at migration 015 via on-box psql as app_service. Cloud pushes remain
outside agent sessions (hard rail #2) — CI is the mechanism.

### task 15 — console screens live data (#43)
- **Goal:** the four console screens (task 10 shells) render real per-org data; dashboard shows the six funnel metrics (spec §5 M3).
- **Shape:** worker `routes/screens.ts` (Hono, auth-gated) + `packages/db/screens.ts` queries + `apps/console/features/screens/` (TanStack Query).
- **RED (committed, cb55953):** auth gate · M0 cross-org denial · six funnel metrics — `services/worker/test/screens-api.test.ts`.
- **Branch:** `feat/task-15-console-screens-live-data`; GREEN landed as #43, 2026-07-15.
- **Docs:** [security S1/S5/S7](security.md) · [patterns/tanstack-query](patterns/tanstack-query.md) · [patterns/hono-route](patterns/hono-route.md) · console-feature skill.

### task 16 — console boot honesty (this PR)
Env validated at the boundary (`lib/env.ts` `parseConsoleEnv`, Zod, empty==missing); `main.tsx`
gates then dynamically imports `app/App` so `lib/supabase`'s module-scope `createClient` can't
white-screen; `ConfigErrorScreen` names each missing var + `apps/console/.env.example`. New pure
views `OrgHomeView`/`OrgSwitcherView` separate ERROR from EMPTY. RED: `tests/console-boot-honesty.test.tsx`
(9). Invariant recorded in lessons.md: keep `lib/supabase` off `main.tsx`'s static import graph.
Docs: [security S7](security.md) · [patterns/react-component](patterns/react-component.md) ·
[patterns/zod-boundary](patterns/zod-boundary.md).

### Non-numbered blocks
- **P0 recovery (#15):** stacked bulk-merge race stranded tasks 3–10; re-landed in one PR. Lesson:
  merge one at a time, base==main first — now contract law (AGENTS.md loop §5).
- **Operating model v2 (#22):** one-page AGENTS.md contract, STATE.md as single state file, honest
  RLS gate, docs demoted to reference. Then **D36 (#34):** PHASE line SETUP/LIVE governs merge authority.
- **Security landings:** gitleaks commit-scoping #21 · transcript UI + S7.1 XSS test #25 (S12.1
  scorecard 6/6 since) · CORS preflight-before-auth #31.
- **Agent economy (#18, #32, #37):** skill routers over bulk doc loads; worker/tester=sonnet,
  scout=haiku in `.claude/agents/`; main thread orchestrates and reviews only.
- **Staging provisioning (#40, #41):** `scripts/provision-staging.sh` — machine-generated secrets,
  one-shot VPS .env install, pooler host aws-1.
- **Docs reconciliation (#46, 2026-07-13):** settled 9 docs-vs-shipped-reality contradictions
  in db-design.md/tech-stack.md/dev-workflow.md (webhook_events lifecycle, created_at exceptions,
  soft-delete list, messages bigint PK, seed path, migration 011 app functions, migration 014
  extensions schema, T26.4 `webhook.process.vapi` job, MODEL ROUTING v2 test-authorship); added
  [runbooks/hygiene.md](runbooks/hygiene.md); paid the three dated STATE.md debt clauses.

### P3 polish — transcript links (this PR)
Split in two: **LiveMonitor half** = task 15 (#43). **Contacts half** = this PR —
`latest_conversation_id` (newest by `started_at`) via a lateral left-join inside `listContacts`'
existing `withOrg` scope (same RLS path, no new query); `ContactsTable.tsx` is a pure leaf
(TranscriptView precedent). RED: `console-contact-links.test.tsx` (4) + 3 CI-owned
`screens-api.test.ts` cases. Lesson: plain `<a>` not wouter `<Link>` — throws under
`renderToStaticMarkup` with no Router — recorded in lessons.md.

---

## 5. Doc map (load on demand, never in bulk)

| Need | Load |
|---|---|
| Where are we right now / what's next / who's blocked | [../STATE.md](../STATE.md) |
| Operating contract (rails, loop, merge authority) | [../AGENTS.md](../AGENTS.md) |
| Product vision, roadmap, moat invariants, P0 backlog | [project-spec](project-spec.md) §5 · §9 · §12 |
| Schema truth (tables, RLS, conventions) | [db-design](db-design.md) + db-work skill |
| Security controls by S-id (S1 tenancy … S13 agent ops) | [security](security.md) |
| Stack decisions by T-id; T26 = harness spec | [tech-stack](tech-stack.md) |
| Process: branches, TDD, DoD, decision protocol §13 | [dev-workflow](dev-workflow.md) |
| Style to imitate | [patterns/](patterns/) |
| Ops procedures (go-live, incident, rotation, VPS) | [runbooks/](runbooks/) |
| Why-history (D31–D36) | [decisions/](decisions/) |
| Surprises log | ../lessons.md |
