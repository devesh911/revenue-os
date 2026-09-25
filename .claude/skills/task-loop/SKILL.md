---
name: task-loop
description: Use when building a roadmap item — any session implementing the next unchecked item of the current slice in ROADMAP.md. The branch → failing test → implementation → gates → PR → observed-green CI → evidence → roadmap/state update procedure, the WIP cap, and merge discipline.
---

# task-loop — the per-item build loop (AGENTS.md is the rulebook; this is the checklist)

## Read first, in this order
1. `AGENTS.md` — hard rails, **Definition of done**, the loop, merge rule.
2. `ROADMAP.md` — the current slice (lowest-numbered not done): its goal, its proof, your item.
3. `STATE.md` — line 1 PHASE, **What works today** (is the thing you touch a Stub? a Tests-only?),
   **Decisions in force**.
4. `docs/NORTH-STAR.md` if the item touches what the product does for a customer.

## The loop (every step blocking)
1. **WIP cap:** three or more open task PRs ⇒ stop and tell Devesh.
2. **Check the item against current main** — it may already be done or overtaken.
3. Branch `feat/…` or `fix/…` off up-to-date `origin/main` — independent, never stacked.
4. **Failing test first**, at the layer you touch. For security, RLS, migration or guard work,
   review the failing tests line by line before writing the implementation.
5. Implement **with its production caller** — a capability nothing real calls is not done.
6. `bun run gates` run bare (never piped). Env-dependent suites: CI is the verdict.
7. Show it working: run it from a real entry point (API call, script against the local stack,
   browser) and capture the evidence.
8. PR body: what / why / evidence. `gh pr checks <n> --watch` — the required `checks` must be
   observed green on GitHub; absent or red means stop.
9. Same PR: tick the item in `ROADMAP.md` with `· evidence: …`; update `STATE.md → What works
   today` if reality changed; add a `Decisions in force` line for any decision.
10. Merge per PHASE (STATE.md line 1): SETUP = squash-merge one PR at a time after confirming
    `gh pr view <n> --json baseRefName` is main; never loop merges. LIVE = never merge.
11. After merge, republish the tracker page (see AGENTS.md → The loop, step 6).
12. If the last item of the slice landed, set the slice to `proof ready` and ask Devesh to watch
    the proof. Never fill in `Seen by Devesh:` yourself.

## Never (any phase)
Edit applied migrations · touch `.env`/secrets · force-push · add a dependency without a
justification line · mutate an active agent/workflow version · approve a PR · call a stubbed or
caller-less capability "done" · merge while `STATE.md` says `PHASE: LIVE`.

## Parallel waves (optional, when items are file-disjoint)
One worktree per item under `.claude/worktrees/` (never in lint scope); worktrees verify env-free and
CI decides; landing stays serial, base == main each time; at most one migration-writing item per wave.

## Learned since this skill was written (run it, don't skip)
`grep -inE 'gates|CI|pipe|worktree|queue|exit code' lessons.md` and read `STATE.md → Decisions in force`.
A newer lesson or decision outranks this file.
