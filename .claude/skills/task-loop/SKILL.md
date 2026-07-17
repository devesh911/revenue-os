---
name: task-loop
description: Use when running the per-task build loop — a /goal Mode B cycle or any session implementing a spec §12 task. The branch→RED→GREEN→gates→PR→verify-CI procedure, WIP cap, sentinels, residual protocol, and merge discipline.
---

# task-loop — thin router (skills advise, docs rule — CLAUDE.md)

## Read first, in this order
1. `docs/dev-workflow.md` §4B — the loop + roles (test-authorship rule for security/RLS/migration/guard-critical work) · §5 TDD mechanics · §6 DoD (goes in the PR body).
2. `docs/project-spec.md` §12 — your task + the acceptance-criteria protocol (agent-verifiable vs human-gated, D34) · §12b — the obligation/residual table.
3. `docs/dev-workflow.md` §3 — stack maintenance + solo-mode merge (D32).
4. `orchestrator/state/HANDOFF.md` — **USER NOTES first, every cycle** (Devesh's steering channel).

## The loop (D32-amended; every step blocking)
1. **WIP cap before anything:** ≥3 open unmerged task PRs ⇒ stop, emit `NEED_HUMAN: stack full — review bottom-up`.
2. Branch `feat/task-NN-slug` off up-to-date `origin/main` — **independent, never stacked** (the 2026-07-10 merge race is why); one PR at a time through merge.
3. **RED before GREEN** — failing tests from the acceptance criteria. **Dispatch, don't do (routing
   v2, 2026-07-13):** ALL RED goes to `tester` (opus 4.8, max effort) — for security/RLS/migration/
   guard-critical RED the orchestrator reviews the returned tests line-by-line BEFORE any GREEN
   dispatch (test-is-spec review supersedes §4B self-authorship). GREEN to `worker` (opus 4.8, max);
   its DOCS DELTA goes to `scribe` (sonnet, max) for PR body/STATE.md/ledger prose; recon to `scout`
   (haiku). The main thread assigns, reads the docs, reviews, and prompts to finish — it implements
   nothing; if no defined agent fits, it may summon a new class (Agent tool, explicit model, hard
   rails inherited) and record it in HANDOFF. **Mechanical steps** (run a command, watch CI, collect
   logs, git mechanics; scoped file/prose edits) route to the tool-capped drone shells — `drone-sh`
   @ haiku (Bash+read) or `drone-edit` @ sonnet (Read/Edit/Write) — with a ROLE CARD per dispatch and
   the model chosen per invocation; never a drone for code/tests.
4. Gates: `bun test` · `bun run lint` · `bun run typecheck` · `bun run rls:check` when the DB is touched.
5. Push · `gh pr create` with the §6 checklist + a **⚠ residuals block** for human-gated criteria (D34).
6. **Verify the pipeline RAN:** `gh pr checks <N>` must show the required `checks` run concluded green **on GitHub**. An absent or red check is a stop signal — fix it or emit `NEED_HUMAN` (S13.7/D32). Local gate output never substitutes.
7. Update HANDOFF (incl. ESCALATIONS mirroring any `lessons.md` append) · checkpoint the orchestrator repo · take the next task or emit the sentinel. Never idle; never exceed the cap.

## Never (structural, not advisory — dev-workflow §12, S13; phase-independent)
Edit applied migrations · touch `.env`/secrets · force-push · add a dependency without a T24 BOM row · mutate an active agent/workflow version · approve a PR (in any phase) · edit `docs/**`/`CLAUDE.md` outside a commissioned or §13 ADR PR · merge anything while `STATE.md` says `PHASE: LIVE` (D36 — LIVE merges are ruleset-enforced human acts).

## Merge discipline (phase-aware — D36; check STATE.md line 1 first)
SETUP phase: agents merge — observed-green required `checks` + tested evidence + base==main confirmed (`gh pr view N --json baseRefName`) + ONE PR at a time, from the repo root. Branches are **independent off `origin/main`** and squash-merge — never stacked (D32; stacking caused the 2026-07-10 race). Never loop `gh pr merge` (lessons.md, 2026-07-10). LIVE phase: no agent merges, period.

## Waves (Step-2 parallel — optional, when tasks are file-disjoint)
Builds, tests, and reviews may run in PARALLEL, one git worktree per task under `.claude/worktrees/`
(gitignored + biome-excluded — a worktree must never enter lint scope). Worktree branches verify
**env-free** locally (typecheck · lint · the unit-test paths the brief names — fresh worktrees have no
`.env`, by rail); CI `checks` is their verdict (S13.7). Landing stays serial: one PR at a time,
base==main re-confirmed each, WIP cap 3 (D32) — parallel builds, serial merges. **≤1 migration-minting
task per wave** (migrations are an append-only global sequence). `STATE.md` · `docs/sdlc.md` ·
`lessons.md` are exempt-shared (every PR touches them) — give each task a distinct insertion target;
their drain conflicts are expected and resolved "keep both, chronological", never grounds to serialize
builds. Product file surfaces MUST be disjoint. Full protocol: `orchestrator/.claude/commands/goal.md`.

## Learned since this router was written (dynamic — run it, don't skip)
`grep -inE 'gates|CI|pipe|worktree|queue|exit code' lessons.md` and read `STATE.md → DECISIONS`.
Findings there outrank this file's snapshot; on contradiction follow the lesson and note that this skill
needs a refresh. Standing examples this stanza would have caught: gates run BARE, pipes swallow exit
codes · diff queued/NEXT items against current main before executing (the #28 duplicate).
