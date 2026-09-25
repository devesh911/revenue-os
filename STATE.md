PHASE: SETUP  <!-- SETUP = agents merge on observed green; LIVE = human merges only. Only Devesh flips it, as the last step of docs/runbooks/go-live.md -->

# State

What actually works today, what is waiting on Devesh, and the decisions still in force.
The "What works today" table is overwritten, never appended to: every PR that changes reality updates it in
the same PR. Decisions are added newest first; Waiting items are ticked when Devesh delivers them.
History lives in `git log`; the previous long version of this file is
`docs/archive/STATE-until-2026-09-25.md`.

Updated: 2026-09-25 (CI check: no public IPv4 address in any committed file)
Current slice: **Slice 0: One source of truth** (see `ROADMAP.md`)

## What works today

Status words: **Works** (the live product uses it) · **Tests only** (works in automated tests with pretend
phone and WhatsApp services; nothing in the live product uses it yet) · **Partial** (some of it works; the
last column says what is missing) · **Stub** (a placeholder that fails on purpose if the live product tries to
use it) · **Missing** (not built).

| Area | Capability | Status | Where / why |
|---|---|---|---|
| Data | Tenant isolation: each company sees only its own rows; every API call checks the user's role | Works | packages/db/src/client.ts withOrg; RLS on all 33 tables (tests/rls_coverage.sql). Rows can still link across companies: Slice 1 |
| Data | Create a company, add members, sign in | Partial | API only (services/worker/src/routes/orgs.ts); no console screen to create a company or invite |
| Data | Import contacts from CSV with phone normalisation and dedupe | Partial | API only (routes/contacts.ts); no console screen; import does not enrol anyone |
| Intake | New leads arrive by themselves (lead ads, portals, website, inbound call) | Missing | No intake webhook exists |
| Engine | Enrol a lead into a sales sequence | Tests only | startRun (services/worker/src/runs.ts) is called only by scripts/demo.ts |
| Engine | Decide each lead's next step | Tests only | A fixed JSON step map (packages/harness/src/workflow); the AI only reports one word. Replaced in Slice 3 |
| Engine | Durable scheduler: wakes due runs every minute, no double sends | Works | services/worker/src/scheduler.ts + pg-boss; has nothing to run until leads are enrolled |
| Voice | Place a real phone call | Stub | services/worker/src/jobs.ts VOICE_STUB throws |
| Voice | Voice agent with lead context and mid-call tools | Missing | Configured by hand in Vapi's dashboard; no sync, no mid-call tool handler |
| Voice | Receive call results: transcript, summary, memory | Partial | Webhook receiver works (services/worker/src/vapi); the call's outcome is not saved (Slice 1) |
| Voice | Feed a call's result back into the lead's sequence | Stub | services/worker/src/jobs.ts OUTCOME_STUB throws; the call job fails after the call (Slice 4) |
| WhatsApp | Send a WhatsApp message | Stub | services/worker/src/jobs.ts WA_STUB throws |
| WhatsApp | Receive WhatsApp replies | Missing | No Meta webhook route |
| Agent | Agent loop: prompt, tools, guardrails, every step written as rows | Works | packages/harness/src/loop.ts; the live worker runs it only after a call is placed (the dialer is a stub) or when a text reply arrives (no WhatsApp route yet), so today only tests and `bun run evals` run it |
| Agent | AI model connected in the live worker | Stub | services/worker/src/jobs.ts UNCONFIGURED_PROVIDER throws until ANTHROPIC_API_KEY is set on the server (Slice 3) |
| Agent | Agent tool that sends a confirmation message | Stub | services/worker/src/jobs.ts UNWIRED_SEND throws; the tool is allowed for the seeded real-estate agent |
| Agent | Memory across conversations | Tests only | Summary written on end-of-call and read into prompts; no real call has produced one |
| Guardrails | Quiet hours, attempt caps, do-not-call check before every send | Partial | packages/harness/src/policies.ts. Nothing ever records do-not-call; the company's approval ("autonomy") setting is saved but never read; the call cap effectively allows two calls, not three; calling hours apply only if the company saved a quiet-hours setting (all Slice 1 or 3) |
| People | Human task queue and hand-off | Partial | Tasks are created and listed read-only; nobody can claim or complete one |
| Console | Screens: home, tasks, conversations, contacts, transcript, dashboard, agents, settings | Partial | Read-only except the guardrail settings form |
| Console | Dashboard numbers are right | Partial | Counts outcome labels the engine never writes, so real bookings would show 0 |
| Quality | Automated tests and CI | Works | .github/workflows/ci.yml; green CI does not mean a customer-facing feature works |
| Quality | CI fails when a committed file contains a public IPv4 address (the server's address must never be published) | Works | scripts/guards.sh (run by `bun run guards` in CI); hits print as file:line only, never the address |
| Quality | Agent evals and an eval gate before a version goes live | Partial | `bun run evals` exists; nothing activates an agent or checks its evals |
| Ops | Metering and cost per lead | Partial | Token counts recorded; provider labelled "fake"; cost always 0 |
| Ops | Deployment | Partial | Staging migrations deploy on every push to main; the worker runs only by hand behind a temporary tunnel; production is off |
| Ops | Monitoring and readiness checks | Partial | Structured logs; /ready returns ok without checking anything |
| Marketing | Landing page with demo booking and analytics | Partial | Runs in preview mode until Cal.com and Plausible are set up |

## Waiting on Devesh

- [ ] **Meta WhatsApp Business**: a test number, access token and one approved message template (unblocks Slice 2)
- [ ] **Anthropic key on the test server** (ANTHROPIC_API_KEY in the staging worker's environment): the AI model's password (unblocks Slice 3). Also confirm VAPI_WEBHOOK_SECRET is still set there: scripts/provision-staging.sh installed it on 2026-07-12
- [ ] **Indian telephony for Vapi**: pick Exotel or Plivo, open the account, get a number, and ask what registration Indian sales calls need (DLT, 140-series numbers). Approval can take weeks, so start now (unblocks Slice 4)
- [ ] **Confirm the first market**: NORTH-STAR and all current work assume Indian real estate; the July spec said ceramic B2B. Reply "real estate" to close this, or "switch"
- [ ] **Sign the pilot customer** with the derived-data clause, and agree their baseline and one success metric in writing (unblocks Slice 6)
- [ ] **Domain purchase**: needed for the permanent worker deploy and fixed webhook addresses before the pilot (Slice 6); Slices 2 and 4 can be tested through a temporary tunnel
- [ ] **Deploy key in GitHub** (STAGING_SSH_KEY) so new code reaches the test server automatically; agents are not allowed to create it (needed for the permanent deploy, Slice 6)
- [ ] **Recording-consent wording** for each pilot's calls (needed before Slice 6)
- [ ] **Landing page go-live inputs**: Cal.com account and event, Plausible site, pilot-guarantee wording, the AI self-identification line, one consented call recording, a readable transcript for accessibility
- [ ] Optional: delete seven stale remote branches (agents cannot delete remote branches)

## Decisions in force

Newest first. One line each; the reason goes in the PR that made the decision.

- 2026-09-25 · **The public-address check excuses one file by path**: `apps/www/src/visuals/IntentEvidence.tsx`, whose SVG icon numbers look exactly like an address; a test holds the list to that one file.
- 2026-09-25 · **Docs have four law files**: AGENTS.md (how we work), docs/NORTH-STAR.md (what and why), ROADMAP.md (what next and what done means), STATE.md (what works, what waits, what we decided). Everything else in docs/ is reference or archive. docs/sdlc.md is retired; git log is the history.
- 2026-09-25 · **Done means seen working** (AGENTS.md → Definition of done). A slice is done only when Devesh has watched its proof.
- 2026-09-25 · **The next step is decided by an AI planner inside the operator's rules** (Slice 3). The fixed step map stays only until then.
- 2026-09-25 · **Database access is parameterised SQL through `tx.query` inside `withOrg`** — what the code does. Drizzle is installed but unused; adopting it for new code is a separate, recorded decision.
- 2026-09-25 · The frozen `.agents/skills` copy and the decision-record ceremony (doc-change skill) are removed. Codex reads AGENTS.md directly.
- **PHASE rule**: SETUP = agents squash-merge one PR at a time on observed-green `checks` with real evidence; LIVE = only humans merge. Loosening any guard or deny-list is Devesh-only in both phases. Every secret created during SETUP counts as burned and is rotated at go-live.
- **Parallel work**: agents work in separate copies under `.claude/worktrees/`; CI is the verdict for tests that need real settings; land one PR at a time; at most 3 open task PRs; at most one database-change task at a time.
- **Scheduler database-error policy** (code cites it as "T6 scheduler DB-error policy"): a failed write undoes that lead's step and retries it; after 3 failed tries the lead's sequence is parked as failed for a person to look at; a broken sequence definition is parked at once; other leads keep running.
- **Guard postures**: do-not-call and attempt caps block when in doubt; quiet hours lets the send through when it cannot tell the lead's time zone, and records `unresolved_contact_tz`.
- **Guardrail config** is validated by one schema in packages/shared, used by both the worker and the console.
- **Memory**: the newest call summary supersedes the old one; recall is plain SQL within an 800-token budget; semantic search waits for an embeddings provider.
- **Workflow task content** is validated in packages/harness/src/workflow/schema.ts, not packages/shared.
- **Queries add an explicit `org_id = $1`** on top of row-level security, as a second fence.
- **Extensions** live in the `extensions` schema; new migrations must schema-qualify them (e.g. `extensions.vector`).
- **webhook_events is a lifecycle table**: the payload never changes; status and processed_at do.
- **Cloudflare Bot Fight Mode stays off** because it would challenge Vapi webhooks. Vapi's webhook secret is write-only: rotating it means updating the assistant and the server together.
- **Marketing site**: keep the editorial design from #98; any restyle is shown to Devesh first. It uses the console's stack (React, Vite, Tailwind). Cal.com is its only outside API. Copy labels illustrative examples and never claims unbuilt features as working.
- **Console**: design tokens in `@theme`, primitives in `src/ui`, one route manifest in `routes.tsx`.
- Bun types stay pinned to the Bun engine version.
