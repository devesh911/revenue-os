PHASE: SETUP  <!-- SETUP = agents merge on observed green; LIVE = human merges only. Only Devesh flips it, as the last step of docs/runbooks/go-live.md -->

# State

What actually works today, what is waiting on Devesh, and the decisions still in force.
The "What works today" table is overwritten, never appended to: every PR that changes reality updates it in
the same PR. Decisions are added newest first; Waiting items are ticked when Devesh delivers them.
History lives in `git log`; the previous long version of this file is
`docs/archive/STATE-until-2026-09-25.md`.

Updated: 2026-09-25 (console sign-in: email and password, lands on the first workspace; before it: VPS address out of the public repo, origin certificate, /ready token, CI check for public IPv4 addresses)
Current slice: **Slice 0: One source of truth** (see `ROADMAP.md`)

## What works today

Status words: **Works** (the live product uses it) · **Tests only** (works in automated tests with pretend
phone and WhatsApp services; nothing in the live product uses it yet) · **Partial** (some of it works; the
last column says what is missing) · **Stub** (a placeholder that fails on purpose if the live product tries to
use it) · **Missing** (not built).

| Area | Capability | Status | Where / why |
|---|---|---|---|
| Data | Tenant isolation: each company sees only its own rows; every API call checks the user's role | Works | packages/db/src/client.ts withOrg; RLS on all 33 tables (tests/rls_coverage.sql). Rows can still link across companies: Slice 1 |
| Data | Create a company and add members | Partial | API only (services/worker/src/routes/orgs.ts); members are added by raw user id: no invite, no console screen |
| Console | Sign in with email and password, land on your first workspace, sign out | Works | apps/console/src/app/session: public /login with a safe return-to, a signed-in gate on every other page, a membership gate with a no-access page, cached data wiped on sign-out. Accounts are invite-only (no sign-up screen). Phone code, Google and admin authenticator codes are not built |
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
| Ops | Deployment | Partial | Staging migrations deploy on every push to main; the worker runs only by hand behind a temporary tunnel; production is off. Caddy is set up for a Cloudflare origin certificate on `API_HOST` with only 443 published (docker/), but the server's address leaked and must change before the api DNS record exists |
| Ops | Monitoring and readiness checks | Partial | Structured logs; /ready needs its own bearer token (READY_TOKEN, refused when unset) but still returns ok without checking anything |
| Marketing | Landing page with demo booking and analytics | Partial | Runs in preview mode until Cal.com and Plausible are set up |

## Waiting on Devesh

- [ ] **Move the VPS to a new IP address**: the current address was committed to this public repo (removed 2026-09-25, still in git history), so it is burned. Move to a new instance or a reserved IP and release the old one BEFORE any `api.<domain>` DNS record exists; keep the new address in the password manager only; in the provider's firewall allow 443 only from Cloudflare's ranges (ufw cannot police Docker's ports). docs/runbooks/vps-cloudflare-setup.md §0
- [ ] **Decide whether the repo stays public**: the old address and earlier infrastructure notes stay in its history either way
- [ ] **Add three empty keys to `.env.example`**: `API_HOST=`, `CORS_ORIGINS=`, `READY_TOKEN=` (agents are not allowed to write `.env.*` files)
- [ ] **Meta WhatsApp Business**: a test number, access token and one approved message template (unblocks Slice 2)
- [ ] **Anthropic key on the test server** (ANTHROPIC_API_KEY in the staging worker's environment): the AI model's password (unblocks Slice 3). Also confirm VAPI_WEBHOOK_SECRET is still set there: scripts/provision-staging.sh installed it on 2026-07-12
- [ ] **Indian telephony for Vapi**: pick Exotel or Plivo, open the account, get a number, and ask what registration Indian sales calls need (DLT, 140-series numbers). Approval can take weeks, so start now (unblocks Slice 4)
- [ ] **Confirm the first market**: NORTH-STAR and all current work assume Indian real estate; the July spec said ceramic B2B. Reply "real estate" to close this, or "switch"
- [ ] **Sign the pilot customer** with the derived-data clause, and agree their baseline and one success metric in writing (unblocks Slice 6)
- [ ] **Domain purchase**: needed for the permanent worker deploy and fixed webhook addresses before the pilot (Slice 6); Slices 2 and 4 can be tested through a temporary tunnel. On domain day also create the Cloudflare origin certificate (runbook §3 and §4 step 3)
- [ ] **Deploy key in GitHub** (STAGING_SSH_KEY) so new code reaches the test server automatically; agents are not allowed to create it (needed for the permanent deploy, Slice 6)
- [ ] **Recording-consent wording** for each pilot's calls (needed before Slice 6)
- [ ] **Landing page go-live inputs**: Cal.com account and event, Plausible site, pilot-guarantee wording, the AI self-identification line, one consented call recording, a readable transcript for accessibility
- [ ] **Phone sign-in**: an SMS provider account plus DLT registration of the sender name and the sign-in code message (can take weeks)
- [ ] **Google sign-in**: a Google Cloud OAuth client and consent screen for the console
- [ ] **Email provider** for invites and password resets (Resend, Postmark or SES) with a verified sending address on the domain; staging's sign-in settings (site address, allowed redirects, email confirmation, password length) are then set in the Supabase dashboard
- [ ] Optional: delete seven stale remote branches (agents cannot delete remote branches)

## Decisions in force

Newest first. One line each; the reason goes in the PR that made the decision.

- 2026-09-25 · **Console sign-in** (Devesh): accounts are invite-only (we create each customer's company and invite its first admin); sign-in by email and password now, phone code and Google next; admins must use an authenticator-app code. Agent defaults: "Sign out" signs out this device only; invites are our own table, because Supabase's built-in invite needs the service-role key; company single sign-on later through Supabase's own SAML, so the worker trusts one token issuer; the browser sign-in test runs inside the required `checks` job.
- 2026-09-25 · **Local settings come from `bun run local <cmd>`** (read from the running local Supabase stack, never printed, never `.env` files); `bun run db:seed` creates the local dev login `dev@local.test`; fixed dev ports: console 5173, console preview 4173, marketing site 5174.
- 2026-09-25 · **The public-address check excuses one file by path**: `apps/www/src/visuals/IntentEvidence.tsx`, whose SVG icon numbers look exactly like an address; a test holds the list to that one file.
- 2026-09-25 · **/ready has its own bearer token (READY_TOKEN)**, refused for everyone when unset: Cloudflare adds X-Edge-Auth to every request it forwards, so that header proves "came through our zone", not "internal". Replaces security.md S5.9's "requires the shared edge header".
- 2026-09-25 · **The origin server uses a Cloudflare Origin CA certificate**, not Let's Encrypt: port 80 is closed and Cloudflare proxies 443, so Let's Encrypt cannot check the box. Replaces security.md S3.6.
- 2026-09-25 · **Server addresses never go in the repo**: scripts read `VPS_HOST`; the address lives in the password manager.
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
