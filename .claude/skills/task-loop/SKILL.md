---
name: task-loop
description: Use when building a roadmap item — any session implementing the next unchecked item of the current slice in ROADMAP.md, or a Side-track or off-roadmap PR. The branch → failing test → implementation → gates → PR → observed-green CI → evidence → roadmap/state update procedure, the WIP cap, and merge discipline.
---

# task-loop — the per-item build loop (AGENTS.md is the rulebook; this is the checklist)

## Read first, in this order
1. `AGENTS.md` — hard rails, **Definition of done**, the loop, merge rule.
2. `ROADMAP.md` — the current slice (`bun run cycle --banner` prints it; the rule is at the top of
   ROADMAP.md): its goal, its proof, your item.
3. `STATE.md` — line 1 PHASE, **What works today** (is the thing you touch a Stub? a Tests-only?),
   **Decisions in force**.
4. `docs/NORTH-STAR.md` if the item touches what the product does for a customer.

## The loop (every step blocking)
1. **WIP cap:** three or more open task PRs ⇒ stop and tell Devesh.
2. **Check the item against current main** — it may already be done or overtaken.
3. Branch `feat/…` or `fix/…` off up-to-date `origin/main` — independent, never stacked — and record
   what it builds: `git config branch.<name>.description "<text>"`, the text being the item's text,
   `Side track: <what>` or `Off-roadmap: <what>` (the hooks show it on every prompt).
4. **Failing test first**, at the layer you touch. For security, RLS, migration or guard work,
   review the failing tests line by line before writing the implementation.
5. Implement **with its production caller** — a capability nothing real calls is not done.
6. `bun run gate` run bare (never piped). Every check passes in `bun run gate` here first, and CI
   confirms it.
7. Show it working: run it from a real entry point (API call, script against the local stack,
   `bun run see <console path>`) and capture the evidence. Then run the verifier agent with
   Devesh's request word for word (when he gave none, the roadmap item's text, word for word); the
   done gate won't let you stop on product code without its PASS, or its CANNOT_VERIFY naming what only Devesh can provide (he is told it is NOT verified).
8. PR body: written as AGENTS.md → The loop, step 4, says (its first line, every line that step says
   it owes, then what / why / evidence); `PR_BODY="$(cat body.md)" bun run
   gate pr` judges it as `rules-from-main` will. `gh pr checks <n> --watch` — every required check
   must be observed green on GitHub; absent or red means stop.
9. Same PR: tick the item in `ROADMAP.md` with `· evidence: …` (a Side-track or off-roadmap PR has
   no line to tick; its PR body's evidence is the record); update `STATE.md → What works today` if
   reality changed; add a `Decisions in force` line for any decision.
10. Merge per PHASE (STATE.md line 1): SETUP = squash-merge one PR at a time after confirming
    `gh pr view <n> --json baseRefName` is main; never loop merges. LIVE = never merge. Merge with
    `gh pr merge <n> --squash --match-head-commit <the PR's full head commit>`; AGENTS.md → The loop,
    step 5, says what the done gate checks before it lets that through.
11. After merge, republish the tracker page (see AGENTS.md → The loop, step 6).
12. If the last item of the slice landed, set the slice to `proof ready`; the proof workflow runs
    `bun run proof <slice>` after the next deploy to main and once a day, and `bun run cycle
    --banner` shows its latest run. When every step passes, set the slice to `done` and write the
    date and the passing run's link after `Proof passed:` (the banner prints the line), in a PR
    whose body carries the run's report (the run posts it to the "Proof reports" GitHub issue,
    which reaches Devesh; `rules-from-main` checks the link and the report); if a step
    fails, add an item naming the failure and set the slice back to `in progress`; a step reported
    as waiting on something in `STATE.md → Waiting on Devesh` changes nothing (AGENTS.md →
    Definition of done).

## Never (any phase)
Edit applied migrations · touch `.env`/secrets · force-push · add a dependency without a
justification line · mutate an active agent/workflow version · approve a PR · call a stubbed or
caller-less capability "done" · merge while `STATE.md` says `PHASE: LIVE` · drop the current item
for a new build ask except as AGENTS.md → The loop, step 1 allows (marketing site: the Side track, no
replan; an item from a later slice: a replan that moves its line into the current slice; anything
else: only after Devesh says "off-roadmap" or "replan") · open a second off-roadmap PR, or a second
Side-track PR, while one of the same kind is open (two separate limits, so one of each may be open;
AGENTS.md → The loop, step 1 has the command that finds them) · commit work that does not belong in
the repo (prospect lists, videos, research, naming, real people's data; the repo's own fake seed
and test data is fine to commit).

## Parallel waves (optional, when items are file-disjoint)
One worktree per item under `.claude/worktrees/` (never in lint scope); every check passes in
`bun run gate` here first, and CI confirms it; landing stays serial, base == main each time; at most one migration-writing item per wave.

## Learned since this skill was written (run it, don't skip)
`grep -inE 'gates|CI|pipe|worktree|queue|exit code' lessons.md` and read `STATE.md → Decisions in force`.
Where they disagree with this file, AGENTS.md decides, then STATE.md → Decisions in force.
