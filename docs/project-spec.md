# Project Spec — Voice-Led Agentic Revenue OS

> **Purpose:** the single holistic context document for Claude Code. Everything decided across strategy sessions lives here or in `db-design.md`. When code and this doc disagree, this doc wins until amended.
> **Companion:** `db-design.md` — complete data layer (DBMS choice, DDL, RLS, seeds). Do not restate schema here; link to it.
> **Last updated:** 2026-07-07 · Owner: Devesh

---

## 0. ID Registry (the naming convention — one table, no exceptions)

Every identifier used across the docs is registered here. **Rule: no new prefix class exists until it has a row in this table.** Ids within every class are append-only — assigned once in creation order, never renumbered or reused; gaps and out-of-numeric-order placement in documents are normal and expected. **Cross-reference rule (D34):** a change that alters facts other documents cite — file counts, section spans, task scopes — patches every citing doc in the same PR; citations are part of the change surface.

| Prefix | Means | Numbered where | Example |
|---|---|---|---|
| **L{A–E}** | Architecture layer | project-spec §4 | LC = agentic harness |
| **D{n}** | Product/architecture decision | project-spec §3 | D13 = Supabase |
| **T{n}** | Tech-stack decision | tech-stack.md | T7 = pg-boss |
| **P{n}** | Build phase | project-spec §5 | P2 = workflow spine |
| **M{n}** | Milestone (ends phase P{n}) | project-spec §5 | M1 = talking demo; M4a/M4b split pilot-live vs case study |
| **G{n}** | Bun guardrail | tech-stack.md T1 | G1 = no bun:* in packages/* |
| **S{n.m}** | Security control | security.md | S2.1 = Data API off |
| **Q{n}** | Open question | project-spec §11 | Q2 = ceramic CRM |
| **VQG** | Voice Quality Gate | tech-stack.md T10 | gates M3 |

## 1. Vision & thesis

**One line:** An agentic workflow platform that runs revenue operations for high-ticket, low-compliance businesses — with multilingual voice agents as the communication layer, not the product.

- Voice is the front door. The product is the funnel: instant response → scoring → qualification → booking → follow-up → human handoff at high intent only.
- The moat is the **conversion data loop**: every interaction links to an eventual outcome; outcomes retrain prioritization; the queue gets smarter with every closed deal. Transcripts alone are worthless; outcome-labeled, org-linked interaction data is the asset.
- Strategy: **think platform, sell wedge.** The core (this spec) is vertical-agnostic; go-to-market is one vertical, one geography, one buyer at a time.
- Long-term multilingual conviction (global English + Hindi + others) ships as an architecture property (language routing layer), starting with EN + Hindi/Hinglish done excellently.

## 2. Current commercial state

- **Design partner (committed): real estate** — inbound-heavy funnel, site-visit booking, WhatsApp follow-up.
- **Second prospect (interested): ceramic e-commerce brand, B2B sales** — outbound qualification of an existing prospect list, produce a ranked call-back list of hot leads.
- Both run on the same schema (see `db-design.md` §10). **Pilot #1 = ceramic B2B (live w12); real estate follows (~w16+) once the case-study number exists.**
- Pricing hypothesis: hybrid — platform fee + per booked outcome.
- **Contract invariant:** every agreement includes the derived-data rights clause (aggregated/anonymized model-improvement rights). Non-negotiable from customer #1.

## 3. Locked decisions (log)

| # | Decision | Choice | Note |
|---|---|---|---|
| D1 | Voice infra | **Assemble on Vapi** (managed) at V1 | Own interface in front of it → swappable later. LiveKit/Pipecat = escape hatch. |
| D2 | Channel emphasis | Voice-first, WhatsApp for follow-up | |
| D3 | Call direction | Inbound + follow-up outbound (+ outbound_list campaigns for ceramic pilot) | No cold discovery. |
| D4 | Console users | Tenant staff work in our console daily | Console = data-labeling machine wearing a UI. |
| D5 | Pricing | Hybrid (platform fee + per outcome) | Requires attribution: `outcomes.conversation_id`. |
| D6 | Tenant size | Mid-market, sales-led | |
| D7 | Languages V1 | English + Hindi/Hinglish | Routing layer built; more languages = config. |
| D8 | Lead discovery | **Split (amended)** | Ranking provided lists ✅ core. **List Builder v0** (bounded, API-based) = gated stretch, see D20. Autonomous multi-source discovery ❌ post-V1. |
| D9 | Data rights | Standard clause, every contract | |
| D10 | Team | Solo founder + AI coding agents (Claude Code) | Timeline multiplier honest: thin-V1 everything. |
| D11 | Deadline | **Pilot live ~week 12**; case-study number ~week 16 | |
| D12 | Budget | < $500/mo total infra during build | See §8 cost plan. |
| D13 | DBMS | **Supabase Pro** (Postgres + Auth + Storage + Realtime + pgvector) | Full rationale in `db-design.md` §1. Self-hosting evaluated & rejected at this stage (solo ops risk on the moat asset; stateless compute may self-host freely, state may not). **Revisit triggers:** monthly bill >$150–200, a hard platform limitation, or a second engineer owning ops. Escape hatch: plain Postgres via `pg_dump`. Infra decisions reopen on triggers, not tweets. |
| D14 | Durability | **pg-boss + workflow_runs tables** at V1 (not Temporal) | Engine-agnostic state schema; Temporal is the scale path. |
| D15 | Harness | **Own the runtime (~2–3k lines)**; borrow patterns, not code | OpenClaw: gateway/channel normalization + canonical tool-call representation. Hermes: stateless subagents + disk-first memory. Tool contract: MCP-style. Personal-assistant harnesses are single-tenant by design — never adopt wholesale. |
| D16 | Auth | Supabase Auth (replaces earlier Clerk lean) | Bundled with D13. |
| D17 | A/B engine | Deferred | Event logging designed so it bolts on. |
| D18 | Pilot order | **Ceramic B2B first** (live w12); real estate second (~w16+) | Smaller surface; exercises scoring + tasks; case-study #1. |
| D19 | P3 connector | **CSV import** (ceramic CRM unknown) | Ask partner their CRM this week; CRM sync becomes the connector only if confirmed in time, else post-pilot. |
| D20 | List Builder v0 | Gated stretch: **starts only if M4a on track** | Google Places adapter → `prospect_candidates` staging (db-design §13) → enrich → dedupe → human approval → promote. Voice-first for cold contacts (WhatsApp needs opt-in), strict attempt caps, DND hard-stops. Pilot metric stays on the provided list for clean attribution. |
| D21 | Repo topology | **One repo, multiple deployables** | Monorepo ≠ monolith; console + worker deploy separately. Details + DB write-ownership in §7. |
| D22 | Cloudflare end-to-end | **Rejected for core; adopted at the edge** | Evaluated 2026-07. D1=SQLite → no RLS (breaks moat invariant #2) and fragments the relational moat; Workers can't host pg-boss/scheduler (would force Layer C rewrite); DO state isn't globally queryable (console/scoring need global queries); savings ~$20/mo vs weeks of redesign on a 12-week clock. **Adopt now:** Cloudflare DNS + WAF + DDoS in front of console/API (free, zero code). **Shortlisted for later:** R2 for recordings when egress costs bite; Hyperdrive if API compute ever moves to Workers; Durable Objects for realtime fan-out if Supabase Realtime strains. **Revisit trigger:** sustained >100k conversations/mo or Postgres egress/compute exceeding ~30% of the infra bill. |
| D23 | Runtime & toolchain | **Bun** (runtime, package manager, test runner) | Devesh's call. Toolchain = unconditional; production runtime keeps one escape hatch (base image). Guardrails revised after Devesh caught the Node-CI-lane contradiction: G1 lint-banned bun:* in packages/*, G2 version pin, G3 rehearsed node:22 fallback (`tech-stack.md` T1). |
| D24 | Console architecture | **Vite + React SPA + Hono API** — Next.js & Vercel dropped | Four-screen internal tool needs no SSR platform. Console = static files on Cloudflare Pages; Hono serves BFF + webhooks in the worker process. Full argument incl. vanilla/jQuery objection: `tech-stack.md` T3–T5. |
| D25 | Hosting | Stateless self-hosted: **one VPS** (worker+API, Docker+Caddy, GH Actions SSH deploy) behind Cloudflare; Pages for console; **state stays on Supabase** | Devesh's self-host instinct adopted per the stateless-vs-state rule. Railway/Fly sanctioned as the lazy path (same Docker image). `tech-stack.md` T8. |
| D26 | Marketing site | **Astro on Cloudflare Pages** (`apps/www`) | SEO landing separate from the console (which needs none). One page at week 3 (demo hook); case study page at week 16. `tech-stack.md` T15. |
| D27 | Security baseline | **`security.md` is authoritative** (S-ids); pre-pilot audit = every box checked | Devesh's top priority. Top five: S2.1 Data API off, S1.2 service key nowhere, S3.3 origin via Cloudflare only, S11.1 2FA everywhere, S6 webhook signatures. |
| D28 | Support access | **Time-boxed org membership** (`org_members.expires_at`) — no RLS bypass, no god mode | Grants audited + auto-expiring; RLS honors expiry. Schema: db-design §14. `tech-stack.md` T21. |
| D29 | Regions | **Mumbai-anchored**: Supabase ap-south-1; VPS DO Bangalore / Vultr Mumbai | India-first clients + DPDP posture; Hetzner has no India region. Voice audio path is Vapi-side; VPS is in the tool-call path. `tech-stack.md` T8. |
| D30 | Voice Quality Gate (VQG) | p50 ≤800ms / p90 ≤1200ms / p99 ≤1800ms voice-to-voice on Indian mobile calls + Hinglish eval thresholds; **gates M3** | Initial targets, calibrated by the task-8 spike; no client integration before VQG passes. `tech-stack.md` T10. |

## 4. Architecture — five layers (V1 scope)

**A. Identity & tenancy** — orgs, members, 3 roles (admin/operator/viewer), API keys, append-only `audit_log` doubling as agent action trace. Postgres RLS everywhere; backend uses non-bypassing `app_service` role + `request.org_id` GUC. *(Schema: db-design §4.)*

**B. Data core** — canonical entities (contacts, identities, companies, deals, appointments, conversations, messages, **outcomes**), JSONB custom fields validated by `field_definitions`, dedupe via `contact_identities` uniqueness, data-rights plumbing (consent flags, derived exports). Outcome is a first-class row, never a status string. *(db-design §5–6.)*

**C. Agentic harness** — own runtime: perceive → decide (LLM + policy) → act (MCP-style tool) → observe loop; versioned `agents` + `workflows`; durable `workflow_runs` (status + `wake_at` scheduler pattern) on pg-boss; **prioritization/scoring service** (heuristics v1 → logistic regression once labels accumulate) writing `tasks.priority` and `contacts.score`; per-contact memory + tenant KB RAG on pgvector; guardrails as config rows (quiet hours, DNC, attempt caps, autonomy tiers). *(db-design §7.)*

**D. Communication** — Vapi webhooks → conversations/messages; language detect-and-route (EN/HI) with per-language ASR/TTS map in `agents.voice_config`; channel abstraction with WhatsApp Business Cloud API first-class; human handoff = warm transfer + whispered context + callback task.

**E. Console, evals, ops** — console screens (V1: **four** — task queue, live conversation monitor w/ takeover, contact timeline + disposition tagging, funnel dashboard w/ 6 metrics); eval harness (10 scripted personas per vertical, run before any agent/workflow version activates); integrations (partner CRM or CSV + Google Calendar + Meta lead webhook); `usage_events` metering; observability = audit_log + traces.

**Deferred:** lead discovery agent, A/B engine, analytics warehouse, Temporal, SSO/SAML, billing automation.

## 5. The 12-week solo plan (supersedes the 17-week/2-eng sheet)

| Phase | Weeks | Ships | Demo milestone |
|---|---|---|---|
| P0 Foundation rails | 0–2 | Supabase project, migrations 000–009 from db-design (§3–§8 + §13 + §14 — D33), RLS + CI coverage test, auth + org bootstrap, Vite SPA + Hono skeleton deployed, audit spine | **M0** two isolated tenants, login, audit rows |
| P1 Talking demo | 2–5 | Vapi assembled (EN+HI), runtime v1 + 3 tools (book_appointment, update_contact, send_confirmation), qualification workflow from seed template, transcripts → schema | **M1** ☎ a number anyone can call; AI qualifies + books. **Outreach starts.** |
| P2 Workflow spine | 5–8 | pg-boss + workflow_runs scheduler, WhatsApp channel + abstraction, dedupe, guardrails enforcement, handoff, rolling memory + KB RAG | **M2** multi-day lifecycle replay (call → no-answer → WA 2h → re-call next 11:00 → booked). Pilot signable. |
| P3 Operator surface (thin) | 8–10 | 4 console screens, 6-metric dashboard, CSV import connector (D19), calendar, metering live | **M3** ceramic staff onboarded; their list flowing |
| P4 Pilot & go-live | 10–12 | Scoring heuristics v1 writing task priority, 10-persona eval gate, cost/latency tuning, consent + DND hard-stops verified, go-live | **M4a** pilot LIVE (w12) → run 4 wks → **M4b** case-study number (~w16) |

**Cut list that made 12 weeks honest:** Temporal→pg-boss; Clerk→Supabase Auth; 2 connectors→1; console 4 screens only; evals 10 personas not 20; dashboard 6 metrics; deals module thin (ceramic pilot only if selected). **Shock absorber if P1–P2 slip:** cut from P3 console polish, never from guardrails/consent/metering. **VQG (D30) gates M3:** the voice layer must pass its latency + language thresholds on real Indian mobile calls before any client-workflow integration. **List Builder v0 (D20) is not on this critical path** — it begins in late P4 at the earliest, and only if the pilot is otherwise on schedule; it must never displace core-loop work.

**GTM parallel track:** w0–2 one-pager + 30-target list + baseline questions · w3–5 demo-led discovery calls (10) + pricing test · w5–8 sign pilot w/ data clause + **capture baseline conversion metrics before go-live** · w8–10 onboard + agree single success metric in writing · w10–16 run pilot, weekly reports, case study, re-approach list.

## 6. Tech stack

> **Authoritative document: `tech-stack.md`** — every choice argued with alternatives, objections answered, and revisit triggers. Summary only here.

- **Runtime/toolchain:** Bun (runtime + package manager + test runner), TypeScript strict. Guardrails G1–G3 keep Node fallback one day away (D23).
- **Console:** Vite + React SPA, Tailwind + hand-rolled components, static on Cloudflare Pages (D24). No Next.js, no Vercel.
- **API + worker:** one Bun process — Hono (BFF + Vapi/Meta webhooks) + pg-boss consumers + scheduler — on one VPS (Docker + Caddy, GH Actions SSH deploy) behind Cloudflare (D25).
- **DB access:** Drizzle ORM (+ sanctioned raw `sql` where clearer); DDL only in `supabase/migrations/`.
- **Agent runtime:** own `packages/harness` — full architecture (loop, tool contract, guard() pipeline, realtime-vs-async surfaces, file layout) in **`tech-stack.md` T26** (D15).
- **Voice:** Vapi behind `packages/channels`' owned interface; Indian SIP (Exotel/Plivo) spike = task 8. **WhatsApp:** Meta Cloud API direct.
- **Validation:** Zod at every boundary, schemas in `packages/shared`. **Embeddings:** provider behind interface; pgvector storage.
- **Testing:** TDD pyramid per `tech-stack.md` T12 — `bun test` unit+integration (real local Supabase), RLS + cross-tenant denial suite, webhook contract tests, eval harness as activation gate, Playwright smoke.
- **Observability:** pino JSON logs + `audit_log`; Langfuse deferred until prompt-debugging pain is real.

## 7. Repo structure

**Topology rule (D21): one repo, multiple deployables.** Monorepo ≠ monolith: the console (static SPA on Cloudflare Pages), the worker+API (one Bun process on the VPS — harness, scheduler, pg-boss consumers, Hono BFF, webhook receivers), and any future voice service are separately deployed processes sharing one repository. Splitting repos is reconsidered only when a second team owns a service, a package is open-sourced, or compliance demands isolation — never for aesthetics.

**Why:** atomic schema changes (migration + all affected code in one commit), zero shared-package versioning overhead, and whole-system visibility for Claude Code — an AI agent can only respect a blast radius it can see.

**DB write-ownership (enforced in review, enables clean service extraction later):**
- worker owns writes to: workflow_runs, conversations, messages, contact_memories, usage_events, contact_scores, outcomes(source=agent)
- console owns writes to: tasks (status), dispositions tagging, org config, agents/workflows drafts, knowledge_documents
- all DB access through packages/db; raw SQL only in supabase/migrations/

```
revenue-os/
├─ CLAUDE.md                  # lean; points here
├─ docs/
│  ├─ project-spec.md         # this file
│  ├─ db-design.md
│  └─ decisions/              # future ADRs, one file per change
├─ supabase/
│  ├─ migrations/             # 000_extensions.sql ... 007_ops.sql (from db-design)
│  └─ seeds/                  # real_estate.sql, b2b_wholesale.sql, eval_personas/
├─ apps/
│  └─ console/                # Vite + React SPA
├─ services/
│  └─ worker/                 # pg-boss consumers, webhook receivers, scheduler
├─ packages/
│  ├─ harness/                # agent runtime, tool registry, policy engine
│  ├─ db/                     # drizzle schema mirror, query helpers, app_service client
│  ├─ channels/               # voice(vapi), whatsapp(meta), shared channel contract
│  └─ shared/                 # types, config, cost tables
└─ tests/
   └─ rls_coverage.sql
```

## 8. Cost plan (< $500/mo build phase)

Supabase Pro $25 (Mumbai) · Cloudflare Pages $0 · VPS Bangalore/Mumbai $6–12 · PostHog $0 · Sentry $0 · Vapi demo usage @ ~$0.07–0.15/min all-in — cap demo/testing at ~1,500 min ≈ $150–225 · LLM (realtime tier: small fast model; post-call summaries: better model) ~$50 · WhatsApp Cloud API ~free at pilot volume · Meta/Google APIs $0. **Guardrail:** `usage_events` metering is live from P1; weekly cost review; per-org spend caps in `guardrail_policies`.

## 9. Moat invariants (never violate — enforce in code review)

1. Every `conversation`, `message`, and `task` must be traceable to a contact and (when known) a `workflow_run`; every business result becomes an `outcomes` row with attribution.
2. RLS enabled on 100% of public tables (CI test); backend never uses the RLS-bypassing service key.
3. Dispositions are mandatory on completed conversations — tag-at-close in console UX; they are training labels, not admin chores.
4. Guardrails (quiet hours, DNC, attempt caps, consent) are config-driven and enforced in the harness before any channel send — no code path around them.
5. Agent/workflow versions are immutable once active; changes = new version + eval gate pass.
6. Derived-data exports only through the sanctioned pipeline (consent-filtered, aggregated).

## 10. CLAUDE.md starter (keep ~100 lines; this is the seed)

```md
# Revenue OS — working agreements
Read docs/project-spec.md, docs/db-design.md, docs/tech-stack.md, docs/security.md before structural changes. Imitate docs/patterns/* over memory.

## Commands
bun dev · bun test · bun db:migrate · bun db:seed real_estate · bun evals

## Non-negotiables
- Every new table: org_id + RLS policies + entry in tests/rls_coverage expectations.
- Never use SUPABASE_SERVICE_ROLE_KEY in app code; use app_service client from packages/db.
- Channel sends go through packages/channels guard() — never call Vapi/Meta SDKs directly.
- Completed conversations require a disposition. Outcomes are rows, not status strings.
- TDD: no feature without tests at its layer; bug fixes start with the failing test.
- No bun:* imports or Bun globals in packages/* (G1).
- Agents/workflows are versioned; mutating an active version is a bug.

## Conventions
TS strict; Drizzle for queries, raw SQL in /supabase/migrations only; bun test colocated; no Bun-only APIs in packages/* (G1);
pino logs {org_id, run_id, conversation_id}; money = numeric+currency; phones = E.164.

## Gotchas
- pg-boss schema lives in pgboss.* — don't add RLS there.
- workflow_runs scheduler polls (status IN pending,waiting AND wake_at <= now()) — keep that index.
- Vapi webhooks arrive out of order; upsert by provider_ref, sequence by messages.seq.
```

## 11. Open questions (resolve via the decision protocol → then move to the Decisions table)

1. ~~Pilot order~~ → **Answered: ceramic B2B first (D18).**
2. **Ceramic brand's CRM:** unknown — ask this week. Until confirmed, CSV import is the connector (D19). Also ask real-estate partner's CRM before their pilot (~w14).
3. ~~List provenance~~ → **Answered: they provide the list AND want discovery.** Scoped as List Builder v0, gated (D20). Ask the brand: target segments (retailers / architects / builders / HoReCa?), priority cities, and expected size of the provided list.
4. **Indian telephony for pilot:** confirm Vapi + Indian numbers path (Exotel/Plivo SIP?) during P1 spike — flag early, it's the likeliest infra surprise.
5. **Recording consent script** wording per pilot (goes into agent system prompt + consent flag).

## 12. First 10 tasks for Claude Code (P0 backlog, acceptance criteria included)

1. Scaffold monorepo per §7 (Bun workspaces); CI = Biome (incl. G1 rule) + typecheck + bun test + rls_coverage.sql against local Supabase + gitleaks. ✅ `bun test` green on empty project **and the `checks` workflow run observed green on a GitHub PR (`gh pr checks`) — local gates never substitute for an executed pipeline (D32/S13.7)**.
2. Write migrations 000–007 verbatim from db-design §3–8. ✅ `supabase db reset` clean; all tables RLS-on.
3. `packages/db`: app_service client wrapper that opens tx + `set_config('request.org_id', …)`. ✅ unit test proves cross-org read fails.
4. Auth + org bootstrap flow (create org, invite member, roles). ✅ two tenants isolated (M0 check).
5. Seed loader: `bun db:seed real_estate | b2b_wholesale`. ✅ dispositions/pipelines/guardrails/agent v1 rows exist.
6. Audit emitter middleware (`audit()` helper) used by one sample mutation. ✅ before/after captured.
7. `packages/harness` skeleton: tool registry + policy hook interface + fake LLM in tests. ✅ loop runs a scripted tool call.
8. Vapi spike: provision number, hello-world assistant from `agents` row, webhook → `conversations`+`messages`. ✅ real call transcribed into DB.
9. Contact CSV import (ceramic path): upload → identities → dedupe on (org, phone). ✅ duplicate rows merge.
10. Console shell: auth guard, org switcher, empty four screens routed. ✅ deployed on Cloudflare Pages; Hono API reachable on the VPS behind Cloudflare.

### 12b. P0 traceability — obligation → owner (D34)

Doc-mandated obligations **not** covered by tasks 1–10 (the delta that makes "all tasks done" ≠ "P0 obligations met"), plus open residuals. A row is added whenever an ADR or law-doc creates an obligation without an owning task; a row leaves only by landing in a merged task PR or an explicit descope ADR.

| Obligation | Source | Owner | Status |
|---|---|---|---|
| CI: dependency audit per PR | T14 · S12.1 | **task 11 (proposed): CI parity** | unowned → drafted here |
| CI: `service_role` grep-guard (build fails if it appears outside `/.github/`) | S1.2 | task 11 | unowned → drafted here |
| CI: secret-shaped grep over console `dist/` | S7.3 | task 11 (needs a console build step in CI) | unowned → drafted here |
| CI: image build per PR | T14 | task 11 or task 14 (deploy) | unowned → drafted here |
| S7.1 XSS-transcript render test in CI | S12.1 | P3 transcript-UI task | deferred by phase |
| Playwright smoke over the four screens | T12 (layer 6) | P3 screen work (noted in PR #11) | deferred by phase |
| Real Vapi call transcribed into DB (task 8 ✅) | §12.8 | **residual: Devesh** — VAPI key, number provisioning, real payload fixtures; S6.2 mechanism + VQG baseline | open |
| Console on Pages + API on VPS behind Cloudflare (task 10 ✅) | §12.10 | **residual: Devesh** — §2.6 cloud steps | open |
| Staging/prod deploy pipeline | T22 · dev-workflow §10 | task 14 (scaffold TODO in deploy.yml) | not started |

---
*Amendments: decision protocol (dev-workflow.md §13) → ADR in docs/decisions/ + edits here in one PR → Decisions table updated. This document is self-contained; no conversation is required context.*
