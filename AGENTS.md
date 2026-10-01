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
   only humans merge. A change to a rule file (the done gate, CI, lint or type settings, the hooks, the verifier, the package
   scripts) needs nobody's approval to start and is explained before it merges: its PR body says which rule changed,
   whether it tightens or loosens it, and why; the agent shows Devesh that explanation in chat, then, in SETUP, merges
   it itself on observed-green checks like any other PR. Agents use Devesh's own GitHub login, so GitHub's settings
   only stop accidents; the hooks enforce what agents must not do (Slice 0's tools item adds the
   refusals still missing).
8. **No false "done"** — never report a capability as working if it runs only in tests, has no
   production caller, or is wired to a stub. Every stub on a production path is listed as
   **Stub** in `STATE.md → What works today`.

## Definition of done
- **An item is done** when (1) it is merged with `checks` green, (2) it is reachable from a
  production entry point with real adapters — or it is explicitly an internal change with no
  runtime surface — and (3) its roadmap line carries evidence: the PR plus how it was seen
  working (command output, screenshot, database rows). Land every capability together with the
  code that calls it; a function nothing calls is not done. Off-roadmap and Side-track PRs are
  not roadmap items: (1) and (2) still apply, and their evidence lives in the PR body.
- **A slice is done** only when Devesh has watched its proof. Agents set a slice to
  `proof ready` and ask him to look; only Devesh fills in `Seen by Devesh:` with a date.
- Passing tests are required and never sufficient. Tests with fakes prove logic, not the product.
- **The done gate enforces this, so nobody has to remember it.** Whenever a Claude agent stops,
  `scripts/done-gate.ts` checks what its session changed in each checkout it worked in (and was the last
  to work in): first the rules against fake-done (throwing
  stubs, exports nothing calls, silenced checks, skipped tests, tests that read source code), then every
  check on the exact code, then, if product code changed, a ruling from the verifier agent
  (`.claude/agents/verifier.md`), which runs the product and compares it with Devesh's words: PASS,
  or CANNOT_VERIFY naming what only Devesh can provide (a real phone number, an account, a key),
  which reaches him marked NOT verified. Until then the agent is sent back to work, and Devesh sees
  each verdict. Codex runs the same gate when a turn ends (`.codex/hooks.json`, once trusted in
  Codex's `/hooks`) but has no verifier agent, so a green product change stops once, marked NOT
  independently verified: ask Claude to run the verifier, or check it yourself. Humans run `bun run gate`.
  The gate stops careless or premature "done", not an agent that sets out to forge it: Devesh's
  own attention and GitHub's required `checks` are the backstops, and `STATE.md → What works
  today` lists the gate's known holes.
- CI also runs the done rules on every pull request (`bun run gate rules`), so they bind every
  agent and human.
- Tests and browser checks run through `bun run gate tests [e2e]`, in the gate and in CI: any test
  reported skipped or todo fails them, however it was switched off, unless `MAY_SKIP` in
  `scripts/done-gate.ts` lists it with why.
- Codex reads hooks from the main checkout's `.codex/hooks.json`, not from a worktree's.
- The shared-database lock covers checks run through `bun run gate` or `bun run see`; running tests
  any other way (`bun test`, `bun run e2e`, `bun run gate tests`) can collide with another agent's run.
- When time slips, cut console polish — never guardrails, consent or metering.

## The loop
1. Take the next unchecked item in the **current slice** of `ROADMAP.md` (the rule is at the top
   of that file; `bun run cycle --banner` prints it, and the agent hooks show it when a session
   starts and on every prompt, but Claude Code loads them only for a session started at the
   repo or a worktree root, never a subfolder). Check it against current main first — it may
   already be done. One item, one branch, one PR. When Devesh asks for something else mid-cycle:
   - a question or look-up: answer it; no branch switch, no code;
   - work that does not belong in the repo (prospect lists, videos, research, naming, real
     people's data; the repo's own fake seed and test data is fine to commit): do it in a
     scratch folder outside the repo; never commit it; no branch;
   - marketing-site work (`apps/www`): the **Side track** in `ROADMAP.md`; no replan;
   - an item already on the roadmap in a later slice: that is a replan, and the PR that builds
     it moves the line into the current slice;
   - any other build ask: reply "off-roadmap PR, or replan?" and build nothing until Devesh
     picks (a replan adds the item to the current slice in the same PR that builds it). A
     message that already starts with "off-roadmap" or "replan" has picked.

   At most one off-roadmap PR is open at a time. Find it by the first line of its PR body (step
   4), never by a phrase search, which also matches a PR that only quotes that line:
   `gh pr list --state open --json number,url,body --jq '.[] | select(.body | startswith("Roadmap: off-roadmap")) | .url'`

   When one is open and Devesh asks for another, link it and ask him to merge or close it, or to
   replan; build nothing new until he answers. The Side track has its own limit of one open PR
   (the same command with `Roadmap: Side track`): when it is full, link that PR and ask Devesh
   to merge or close it first.
2. Branch `feat/…` or `fix/…` off up-to-date main — independent, never stacked — and record what
   it builds: `git config branch.<name>.description "<text>"`. The text is the roadmap item's
   text, `Side track: <what>` for marketing-site work, or `Off-roadmap: <what>` for an
   off-roadmap PR. Tests at the layer you touch; integration tests run against the real local
   Supabase stack and real pg-boss — never mock the database; a bug fix starts from a failing
   reproduction.
3. `bun run gate` green, run bare — never pipe a gate through anything that can swallow its exit
   code. It runs typecheck, lint, guards, every test and the RLS check against the real local stack,
   and the browser checks. Never skip, silence or weaken a check to get past it. CI also runs
   gitleaks, `bun audit` and a Docker build; CI is the verdict.
4. See it work (`bun run see <console path>` saves what a signed-in person sees), then run the
   verifier agent with Devesh's request word for word. PR body: the first line is `Roadmap: Slice N —
   <item>`, `Roadmap: Side track — <what>` or `Roadmap: off-roadmap — <what>`; then what / why /
   evidence (the gate's line, the verifier's ruling, how the result was seen working). Watch CI:
   `gh pr checks <n> --watch`. Green means observed green on GitHub.
5. Merge per the PHASE rule: one PR at a time, confirm `base == main`, never loop merges. At
   three or more open task PRs, stop taking new work. Merge with `gh pr merge <number>`, one per
   command: the done gate refuses it unless the PR's head commit, exactly, passed `bun run gate` on this
   machine and, for product code, the verifier ruled PASS on it; a CANNOT_VERIFY means only Devesh
   merges it. `--auto` needs `--match-head-commit <that commit>`.
6. The same PR ticks its roadmap item with evidence (an off-roadmap or Side-track PR has no line
   to tick; its PR body's what / why / evidence is the record), updates `STATE.md → What works
   today` if reality changed, and adds a line to `STATE.md → Decisions in force` for any decision.
   Any area the PR touches that has an entry in `docs/fix-when-touched.md` gets that fix in the same PR.
   A genuine surprise gets one factual line in `lessons.md`. After ROADMAP.md or STATE.md change
   on main, republish the tracker page (Claude: Artifact publish of `docs/tracker/index.html`
   with files `ROADMAP.md`, `STATE.md` and `parse.js` from `docs/tracker/parse.js`, `url` = the
   tracker link above).

## When Devesh corrects you
Fix it, then turn that kind of mistake into a check so it can't come back: the prevent-repeat skill
(`.claude/skills/prevent-repeat/SKILL.md`) says how. A correction that only becomes a note will be
made again.

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
`bun run gate` (every check, plus the done rules) · `bun run see <console path>` (screenshot and
errors as the dev login) · `bun run cycle --banner` (where we are: current slice, next item,
this branch's item) · `bun run local <cmd>` (any command with the running local stack's
settings) · `bun run dev` · `bun run db:reset`
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
  guardrail fields (one exception: it may add a do-not-call block heard on a call, never remove one or grant consent) · no in-memory agent state (rows or it didn't happen) · no per-vertical code
  in `packages/harness` (verticals are seed/config rows).
- Logs are pino JSON with `org_id`, `run_id`, `conversation_id` where known.
- G1: no `bun:*` imports or `Bun.` globals in `packages/**` (imports are lint-enforced).
- Hygiene: delete merged branches with `git branch -d`; `-D` only for a squash-merged branch whose
  tip is exactly the head its merged PR merged; remove worktrees with
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
