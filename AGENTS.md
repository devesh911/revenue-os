# Revenue OS — how we work (v3 · 2026-09-25)

The operating rules for every contributor — Claude, Codex or human. If a rule is not in this
file, it is advice. Four files are law, each answering one question:

| File | Answers |
|---|---|
| `AGENTS.md` (this file) | How do we work? |
| `docs/NORTH-STAR.md` | What are we building, and why? |
| `ROADMAP.md` | What do we build next, and what counts as done? |
| `STATE.md` | What actually works today, what waits on Devesh, what have we decided? |

Everything else in `docs/` is reference (useful, may describe unbuilt things) or `docs/archive/`
(history — never cite it as current). Tracker page, rendered from ROADMAP.md and STATE.md:
https://claude.ai/artifact/AA8oywPgYW1VgSefP4Va2E

## Hard rails (never, no exceptions)
1. **Secrets** — never read or write `.env*` values; never put tokens in chat, commits or logs.
2. **Cloud** — no prod deploys; no `supabase link`, `supabase db push` or `bun run db:migrate`
   from agent sessions. Every merge to main already applies new migrations to cloud staging
   (`.github/workflows/deploy.yml`), so merging a migration *is* a cloud push: treat it that way.
3. **Tenancy** — every new tenant table ships with `org_id` + RLS + a cross-tenant denial test in
   the same PR (RLS is enforced on all tables by `tests/rls_coverage.sql`; denial tests do not yet
   cover every older table). DB access only through `packages/db` `withOrg` (the `app_service`
   role + `request.org_id`). Never the Supabase service-role key in app code. Only `agents`, `workflows` and `eval_scenarios` may
   hold global template rows with a null `org_id`.
4. **History** — migrations are append-only (expand–contract); never edit an applied one; never
   force-push a shared branch.
5. **Sends** — outbound messages only through `packages/channels` doorways, which run `guard()`
   first; tool side effects pass the autonomy check; approval-gated actions become a human task,
   never a silent drop.
6. **Webhooks** — authenticate before trusting, dedupe with a database constraint, store and
   return fast; side effects happen in workers.
7. **main is PR-only with CI green** (required check: `checks`). Merge authority follows the
   PHASE line on line 1 of `STATE.md`: SETUP = agents squash-merge independent PRs one at a
   time on observed-green checks with real evidence, after confirming base == main; LIVE =
   only humans merge. Loosening any guard or deny-list is Devesh-only in both phases.
8. **No false "done"** — never report a capability as working if it runs only in tests, has no
   production caller, or is wired to a stub. Every stub on a production path is listed as
   **Stub** in `STATE.md → What works today`.

## Definition of done
- **An item is done** when (1) it is merged with `checks` green, (2) it is reachable from a
  production entry point with real adapters — or it is explicitly an internal change with no
  runtime surface — and (3) its roadmap line carries evidence: the PR plus how it was seen
  working (command output, screenshot, database rows). Land every capability together with the
  code that calls it; a function nothing calls is not done.
- **A slice is done** only when Devesh has watched its proof. Agents set a slice to
  `proof ready` and ask him to look; only Devesh fills in `Seen by Devesh:` with a date.
- Passing tests are required and never sufficient. Tests with fakes prove logic, not the product.
- When time slips, cut console polish — never guardrails, consent or metering.

## The loop
1. Take the next unchecked item in the **current slice** of `ROADMAP.md` (the lowest-numbered
   slice that is not `done`, not `proof ready`, and not blocked by anything unfinished), or
   Devesh's explicit ask. Check it against current main first — it may already be done. One
   item, one branch, one PR.
2. Branch `feat/…` or `fix/…` off up-to-date main — independent, never stacked. Tests at the
   layer you touch; integration tests run against the real local Supabase stack and real
   pg-boss — never mock the database; a bug fix starts from a failing reproduction.
3. `bun run gates` green locally, run bare — never pipe a gate through anything that can
   swallow its exit code. CI also runs gitleaks, `bun audit`, the console build, `bun run
   guards` and a Docker build; CI is the verdict, especially for env-dependent suites
   (fresh worktrees have no `.env`).
4. PR body: what / why / evidence (gate output and how the result was seen working). Watch CI:
   `gh pr checks <n> --watch`. Green means observed green on GitHub.
5. Merge per the PHASE rule: one PR at a time, confirm `base == main`, never loop merges. At
   three or more open task PRs, stop taking new work.
6. The same PR ticks the roadmap item with evidence, updates `STATE.md → What works today` if
   reality changed, and adds a line to `STATE.md → Decisions in force` for any decision made.
   A genuine surprise gets one factual line in `lessons.md`. After ROADMAP.md or STATE.md change
   on main, republish the tracker page (Claude: Artifact publish of `docs/tracker/index.html`
   with files `ROADMAP.md` and `STATE.md`, `url` = the tracker link above).

## Escalate to Devesh only for
Credentials · money · external accounts · irreversible or outward-facing actions · genuine
product-direction forks · marking a slice done. Everything else: pick the boring option,
record one line in `STATE.md → Decisions in force`, keep moving.

## Docs
- The four law files must agree with each other and with the code. When code and a law file
  disagree about what exists, the code is right: fix the file in the same PR.
- Changing a fact that other files cite? Update every citation in the same PR.
- Name things in plain words. No new ID prefixes; the only numbered things are roadmap slices.
  Old IDs (D, T, S, task-N) survive only where code already cites them. When you touch a file
  whose comments cite an archived doc or an old ID, point the comment at the file that now holds
  the fact, in the same PR.
- `docs/patterns/` holds the style to imitate: its rules bind; its examples are illustrations.

## Commands (scripts are the interface)
`bun run gates` (typecheck + lint + test + RLS check) · `bun run local <cmd>` (any command with the
running local stack's settings) · `bun run dev` · `bun run db:reset`
(local only) · `bun run db:seed <pack>` · `bun run demo` · `bun run evals` · `bun run guards`

## Conventions
- **Moat rules**: every conversation, message and task traces to a contact and, when known, a
  workflow run; every business result is an append-only `outcomes` row with attribution, never
  a status string · RLS on every public table · completed conversations require a disposition
  (not yet enforced: Slice 1) · guardrails run before every send · active agent and workflow
  versions are immutable — change means a new version plus passing evals · derived-data exports
  only through a consent-filtered, aggregated pipeline.
- TypeScript strict. Zod at every boundary: HTTP and webhook shapes in `packages/shared`;
  engine-internal schemas next to their module.
- **Database access** is parameterised SQL through `tx.query(text, [values])` inside `withOrg`,
  with `org_id` in every where clause as a second fence. Never concatenate values into SQL.
  One Postgres driver (`pg`).
- Money is numeric + currency; phone numbers are normalised to E.164 before insert.
- Dependencies are exact-pinned, and so are the Bun engine, GitHub Actions (by commit SHA), the
  Supabase CLI and the Docker base image; upgrades are deliberate PRs. A new dependency needs a
  one-line justification in the PR and a `STATE.md` decision line. Prefer the platform (`fetch`,
  `crypto`, `Intl`) over packages.
- Write ownership: the worker writes runs, conversations, messages, memories, usage and
  scores; the console writes task status, dispositions, config and drafts.
- **Agent harness**: tool arguments are validated before execute · `guard()` before any side
  effect · job handlers first reload the row and no-op if stale · retrieved text (memories,
  knowledge) enters prompts fenced and labelled as data · model output never writes consent or
  guardrail fields · no in-memory agent state (rows or it didn't happen) · no per-vertical code
  in `packages/harness` (verticals are seed/config rows).
- Logs are pino JSON with `org_id`, `run_id`, `conversation_id` where known.
- G1: no `bun:*` imports or `Bun.` globals in `packages/**` (imports are lint-enforced).
- Hygiene: delete merged branches with `git branch -d` (never `-D`); remove worktrees with
  `git worktree remove` (never `rm -rf`).

## Gotchas
- The `pgboss.*` schema has no RLS by design; its jobs carry ids only and every handler
  re-enters `withOrg`. The `workflow_runs (status, wake_at)` index is sacred.
- Vapi webhooks arrive out of order: upsert the conversation by `provider_ref`, order
  transcripts by `messages.seq`. The receiver compares the `x-vapi-secret` header (one shared
  secret today) in a timing-safe way — it is not a body signature — and the org comes from the
  URL. `webhook_events` is a lifecycle table: `payload` never changes; status and processed_at do.
- Worktrees live under `.claude/worktrees/` and must never enter lint scope. Local database URLs
  need the `app_service` password used in `.github/workflows/ci.yml`.
- The `@harness/*` and `@db/*` path aliases are type-only; `scripts/` is not a workspace, so
  value imports there use relative paths. Test files are outside typecheck scope.
- `bun`'s `mock.module` is process-wide and hoisted: always spread the real module.
- Tailwind v4 apps need their own `biome.json` with Tailwind directives; never trust
  `biome migrate` on the `recommended` preset.
