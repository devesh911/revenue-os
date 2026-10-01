# Fix when touched

This list is the clean-up that gets no roadmap slice: stale comments, unused code, tests that check the wrong thing, out-of-date agent instructions and docs, and leftover branches. Each entry is fixed in the same PR as any change that touches its area, never as a project of its own. It lives at `docs/fix-when-touched.md`, and AGENTS.md → The loop, step 6, sends every PR here.

**How to use it**
- Find the folder you are editing in the table below, and do that entry's fix for the files your PR touches. Your PR still names its own roadmap item on its first line; the PR body adds one line saying which entry here it also fixed.
- One entry has a latest date: the runbooks must be fixed by Slice 6's security walk.
- Anything that needs Devesh (his Mac, his settings, his files) is in STATE.md → Waiting on Devesh, not here.
- When an entry is fully fixed, strike it from this list in that same PR.
- File and line references were checked against main at commit ef7c60d on 2026-09-29.

## Find your area

| If your PR touches… | Fix this too |
|---|---|
| Any source file in `packages/`, `services/`, `apps/console/`, `scripts/`, `tests/` or `supabase/` | 1. Comments that point at old codes or say untrue things |
| `packages/db/`, `packages/harness/`, `services/worker/src/scheduler.ts`, `apps/console/src/ui/primitives/`, `docs/db-design.md`, `docs/tech-stack.md` | 2. Unused code that shows agents a second way of doing things |
| `tests/`, `apps/console/test/`, `packages/harness/test/anthropic.test.ts`, `scripts/dev-login.test.ts` | 3. Tests that read source code as text |
| `.claude/skills/`, `lessons.md` | 4. Agent instructions that restate drifting facts |
| `docs/runbooks/`, `docs/security.md`, `docs/decisions/D36-phased-security-posture.md` | 5. Runbooks that still describe the retired orchestrator |
| `docs/tracker/` | 6. Tracker page shows where it was published from |
| `scripts/demo.ts`, `tests/`, `scripts/dev-login.test.ts` | 9. Imports the lint rule allows only as exceptions |
| Local branches, `.claude/worktrees/`, `.gitignore` | 8. Leftover branches and worktrees |

## Product code

### 1. Comments that point at old codes or say untrue things

**Fix:** In each file your PR touches, replace old task, milestone, moat and spec-section numbers (such as `task 1`, `T9`, `M2`, `moat #4`, `§12`, all defined only in docs/archive) with plain words or the file that now holds the fact, and correct any comment that names a finished task as the fix for a stub that is still live.

**When:** the PR that next touches the file. AGENTS.md → Docs already requires this; this entry lists where it is still owed.

**Known spots on main:**
- About 101 of 243 source files carry an old code. Bare `T2` to `T9` are the worst, because docs/tech-stack.md reuses those numbers for different topics (for example `packages/channels/src/types.ts:1` says "T5" meaning an old task, while tech-stack's T5 is the web framework).
- `services/worker/src/jobs.ts:64` says a finished task "swaps the real adapter", but the stub is still live.
- `services/worker/src/index.ts:35`: the readiness check (`/ready`) shows an internal to-do note to whoever calls it. Slice 1's readiness item replaces this reply; if you touch the file first, drop the note.
- `services/worker/src/index.ts:62`: "TODO: mount packages/harness loop consumers", which `jobs.ts` already does.
- `packages/harness/src/policies.ts:3-4` says the do-not-call, calling-hours, attempt-limit and spending-limit checks arrive later; the first three already exist there and the spending limit does not exist yet.
- `packages/harness/src/types.ts:47` says company settings can tighten a tool's approval level; nothing does that.
- `packages/harness/src/loop.ts:22-25`, `packages/db/src/screens.ts:1`, `scripts/guards.sh:2`.

**From findings:**
- Old ID codes in code comments point to archived docs, and the T-numbers collide with docs/tech-stack.md
- Code comments name finished tasks as the fix for stubs that are still live

### 2. Unused code that shows agents a second way of doing things

**Fix:** Delete code nothing in the product calls, so agents stop building on it, and mark in docs/db-design.md the tables no code uses yet as reserved.

**When:** the PR that next touches that package or doc.

**What goes, and where:**
- The unused copy of three tables written for the Drizzle database library, which the product does not use: `packages/db/src/schema.ts`, the `export * as schema` line and the "the ONLY DB entry" comment in `packages/db/src/index.ts:1`, `drizzle-orm` in `packages/db/package.json`, Drizzle's listing in docs/tech-stack.md, and the Drizzle example in docs/patterns if Slice 0's examples item has not already removed it.
- The unused functions that pick an AI model by name: `registerProvider` and `selectProvider` in `packages/harness/src/llm/index.ts` (re-exported at `packages/harness/src/index.ts:10-11`); fix that file's header, since the live worker builds its model client in `jobs.ts`.
- The old harness demo script `packages/harness/demo-harness.ts` (outside the type check, and it no longer type-checks), plus the harness-agent skill line telling agents to run it; `bun run demo` and `bun run evals` cover it.
- The unused text-box component `apps/console/src/ui/primitives/Textarea.tsx`, or keep it with a note saying it is a design-system piece waiting for a screen.
- The scheduler's separate hand-over action, which nothing produces: `services/worker/src/scheduler.ts:400-417` and the `handoff` action kind in `packages/harness/src/workflow/schema.ts:75` and `:134`. Only this action kind is dead: hand-over tasks that a sequence's tool step creates are live and stay.
- docs/db-design.md marks as "reserved, no code yet" the 16 tables no product code reads or writes (profiles, api_keys, companies, pipelines, pipeline_stages, deals, field_definitions, dispositions, campaigns, knowledge_documents, knowledge_chunks, contact_scores, integrations, eval_scenarios, eval_runs, prospect_candidates).

**From findings:**
- Dead modules that advertise a second way of doing things: Drizzle schema mirror and dependency, AI-provider registry, a stale demo script, an unused component
- Half the schema has no production code, and a Drizzle 'mirror' covers 3 of 33 tables, is unused, and is labelled the only DB entry

## Tests

### 3. Tests that read source code as text

**Fix:** When you edit one of these test files, replace its checks that read source code as text with a test that renders, calls or drives the code (or with a lint rule), delete false "RED today" comments (they claim a passing test fails) and checks that only pin a finished file move, and move console tests from `tests/` into `apps/console/test/`.

**When:** the PR that next edits the test file. The rule is that behaviour is proved by behaviour tests; reading source stays fine for architecture checks and secret scans. The done gate already refuses new source-reading test lines (`scripts/done-gate.ts:280-285`), so only the existing ones remain.

**Why it matters:** `apps/console/test/guardrails-console.test.tsx` checked that the Settings save's source said `PUT` and stayed green for about two months while the browser blocked that save.

**Files, with the replacement to write:**
- `apps/console/test/guardrails-console.test.tsx` (source half): a browser test that saves calling hours, reloads and sees the value kept, and sees an error on bad input. Slice 1's browser-check item writes this test; delete the source half in that PR.
- `apps/console/test/pages-adoption-source.test.ts`, and the source halves of `pages-adoption-home-dashboard.test.tsx` and `pages-adoption-tasks-agents-settings.test.tsx`: delete; their render tests stay.
- `apps/console/test/trends-analytics.test.tsx` (source half): a browser test that the Analytics screen shows the seeded numbers.
- `tests/app-error-boundary.test.tsx` and `tests/console-boot-honesty.test.tsx`: browser start-up tests (the error screen and a good start), plus a lint rule that only `src/lib/supabase.ts` may import the Supabase client.
- `tests/console-contact-links.test.tsx`: a browser test that clicks a contact's conversation link and lands on its transcript.
- `tests/conversation-link.test.tsx`: keep its render test, moved to `apps/console/test/`; delete the rest.
- `tests/transcript-xss.test.tsx`: delete; the lint rule against raw HTML injection already covers it.
- `packages/harness/test/anthropic.test.ts` ("no SDK import" check): a lint rule that blocks importing the Anthropic SDK in `packages/`.
- `scripts/dev-login.test.ts` (seed source check): run `bun run db:seed` and sign in.
- Acceptable as they are (they check docs or settings, not product code): `apps/console/test/readme-coverage.test.ts`, `apps/console/test/ui-contract.test.tsx`, `scripts/guards.test.ts`.
- "RED today" comments on main: `apps/console/test/pages-adoption-tasks-agents-settings.test.tsx` (13), `tests/conversation-link.test.tsx` (10), `apps/console/test/pages-adoption-behavior.test.tsx` (4), `tests/console-contact-links.test.tsx` (3), `tests/vite-api-url-honesty.test.tsx` (2), and one each in `pages-adoption-home-dashboard.test.tsx`, `pages-adoption-source.test.ts`, `packages/channels/test/channels.test.ts`, `packages/shared/test/api-error.test.ts`.
- `apps/console/test/README.md:4` and the "RED idiom" comments in `guardrails-console.test.tsx` stop teaching "read the source as text" when either file is next edited.

**From findings:**
- 16 test files check source code as text instead of what the code does, and the repo teaches this as 'the RED idiom'
- 38 stale 'RED today' comments on passing tests, tests that only pin a finished file move, and console tests split across two folders

## Agent instructions

### 4. Agent instructions that restate drifting facts

**Fix:** When a skill is next edited, cut facts that drift down to pointers (files to read, commands to run), remove its sentence saying lessons.md outranks it (AGENTS.md, then STATE.md → Decisions in force, decide), and turn each still-true lesson it relies on into a check (a test, a lint rule or a verifier line).

**When:** the PR that next edits that skill or lessons.md.

**Known spots on main:**
- "Outranks" sentences: `.claude/skills/console-feature/SKILL.md:26`, `db-work/SKILL.md:15`, `harness-agent/SKILL.md:28`, `task-loop/SKILL.md:61`, `worker-webhook/SKILL.md:27`.
- Drifted facts: console-feature says browser tests are not run in CI (they are) and that query keys come from one shared factory (each feature defines its own), and cites an archived decision code; worker-webhook says local settings come from `supabase status` (they come from `bun run local <cmd>`); harness-agent says all types live in `src/types.ts` (14 live elsewhere).
- lessons.md (36 KB, about 56 entries, many resolved or from the retired orchestrator) is the source for the checks. Still-true lessons worth a check first: a piped gate hiding its failure, a test mock that replaces a whole module without keeping the real parts, a guard with no production caller, test data that describes a world that doesn't exist, the lint preset being silently switched off, company links without delete rules, cross-site scripting tests that check the wrong text, and a blank secret in the web server's settings.

**Not here:** whether the two skills switched off on Devesh's machine should be on is his lane-settings item in Waiting on Devesh.

**From findings:**
- Skills tell agents that lessons.md outranks them, but lessons.md is 36 KB of mostly resolved history that calls itself 'not law'; its lessons should become checks
- Skills restate facts that have drifted; two of five skills are switched off locally; a stale untracked .agents skill copy remains

## Docs

### 5. Runbooks that still describe the retired orchestrator

**Fix:** The go-live and incident runbooks stop citing the retired orchestrator (the old unattended agent runner): go-live lists the exact merge-protection settings to apply for human-only merges (PR required, `checks` required, one approval, code-owner review, no force-push or branch deletion, no bypass for any login agents use), and incident says how to stop running agent sessions and worktrees, sign agents out of GitHub and close their PRs.

**When:** the PR that next touches `docs/runbooks/` or `docs/security.md`, and at the latest in Slice 6's security-checklist walk, whose roadmap line names this entry.

**Known spots on main:**
- `docs/runbooks/go-live.md:5, 12, 22-25, 61-62, 68, 70` cite orchestrator files and a merge-rule backup that no longer exist, so the go-live step that restores human-only merges can't be followed.
- `docs/runbooks/incident.md:6-14`: its "stop everything" step stops the orchestrator, not today's agent sessions.
- `docs/runbooks/vps-cloudflare-setup.md:4` and the phased security posture decision (`docs/decisions/D36-phased-security-posture.md:64`) cite orchestrator files.
- `docs/security.md:118-137` (section S13, the orchestrator's controls): its orchestrator-only controls (the bot's token, the disposable machine, the watchdog kill switch) move to docs/archive; the controls for the platform stay.

**Not here:** removing the orchestrator's watchdog from Devesh's Mac is his lane-settings item in Waiting on Devesh.

**From findings:**
- The retired orchestrator is still wired into the go-live and incident runbooks, and its watchdog is still installed on Devesh's Mac

### 6. Tracker page shows where it was published from

**Fix:** The tracker page shows the commit and date it was published from, beside its "Updated:" line, so Devesh can see at a glance when it has fallen behind main.

**When:** the next PR that changes `docs/tracker/`. AGENTS.md → The loop, step 6, already requires republishing after ROADMAP.md or STATE.md change on main.

**From findings:**
- The tracker page Devesh uses to see progress is 3 days stale; the manual republish step was skipped

## Local checkout

### 8. Leftover branches and worktrees

**Fix:** Whenever an agent cleans up after its own merged PR, it also deletes other local branches already merged into main, removes worktrees whose branch is merged and that have no uncommitted changes and no running session, clears worktree entries whose folder is gone, and adds `.agents/` to `.gitignore` so a second copy of the skills can't be committed.

**When:** any agent's clean-up after its own PR.

**State on 2026-09-29:**
- Local branches: on 2026-09-29, with Devesh's approval, 32 were deleted: 10 already merged into main (`git branch -d`) and 22 squash-merged whose tip is exactly the head their PR merged (`git branch -D`). 15 remain: 8 checked out in a worktree, 7 with no exactly matching merged PR (they may hold work that never landed). AGENTS.md → Hygiene now allows `-D` only for that exact case.
- 9 worktrees. The Downloads clone and the main checkout's stray `.agents` copy are already gone, but git still lists `~/Downloads/revenue-os/.claude/worktrees/marketing-launch` as prunable; `git worktree prune` clears it.
- Never remove `.claude/worktrees/realestate-prospecting-pipeline-f68eb3`: it holds Devesh's prospect spreadsheets (`sales-prospecting/`), which he moves out first (his lane-settings item).
- `.agents/` is still not in `.gitignore`.

**From findings:**
- Stale worktrees, branches, a second out-of-date clone, and untracked out-of-date skill copies around the main checkout

## Imports

### 9. Imports the lint rule allows only as exceptions

**Fix:** When you edit one of these files, remove its exception from the lint rule's allowed list: `scripts/demo.ts` stops reaching into the worker's and packages' internal files (8 imports) and enrols its lead through the start-outreach route (Slice 2) and the worker's public surface; the 11 root console tests in `tests/` move into `apps/console/test/` (entry 3) and import only what the console exports; `scripts/dev-login.test.ts` stops importing the worker's source (1 import).

**When:** the PR that next edits the file, once Slice 3's import rule has landed (before that, there is no list to strike from).

**From findings:** none of its own. This is the remainder of "Module boundaries are not enforced", which Slice 3's lint line settles.

---

8 entries, from 11 findings.
