# D32 — Execution rails after the P0 shakedown: verified CI, bounded WIP, Mode A parity, repo hygiene (DRAFT — awaiting Devesh's merge per dev-workflow §13)

**Status:** Draft. Consumes the 2026-07-10 CI and gitleaks lessons.md entries. Not law until merged.
**Affected law-docs (edited in this PR):** dev-workflow.md (§3, §4A, §4B) · security.md (S13.1, S13.7, new S9.6) · project-spec.md (§12 task 1). Plus the rail itself: root `.claude/settings.json` (new, in this PR).

## Context

The 2026-07-10 P0 shakedown ran ten tasks in one day and exposed four process holes:

1. **CI never executed** for the entire build. The scaffold's workflow YAML was unparseable —
   GitHub logged "workflow file issue" on every push, no job ever ran — while local gates stayed
   green. S13.7 names CI "the trust anchor," but no step anywhere *observed* it: task 1's
   acceptance criterion was local-only (`bun test` green), and the §4B loop proceeded from
   `gh pr create` straight to the next task. Ten PRs shipped against a dead pipeline.
2. **Unbounded WIP against a single human gate.** "Never idle — take the next task" plus a
   weekly merge cadence and no stack-depth limit produced a 10-deep unmerged stack; each low-stack
   fix then required a merge cascade across every branch above it — 41 of 69 commits on the
   stack tip are cascade merges. The docs mandate stacking but define neither fix propagation
   nor a merge method (squash would break every stacked PR above the merged one).
3. **Mode A had no rails.** S13 gates Mode B; the ten tasks ran through Mode A under the
   owner's fully-privileged identity, in a repo with zero deny rules — local settings even
   allowlisted `gh pr *`, making `gh pr merge` prompt-free. The ruleset now active on `main`
   (PR + required `checks` + approval + code-owner review) has a repo-admin bypass, which agent
   sessions currently inherit by sharing Devesh's identity until the S13.2 bot PAT lands.
4. **A real secret-hygiene near-miss.** A `git add -A` fix commit on a stack branch whose
   `.gitignore` predated the `.env.local` rule committed a local env file; the remedy allowlisted
   the *path* in gitleaks, which would also blind the scanner to any future real secret there.

## Decision

1. **Verify the pipeline ran** (dev-workflow §4B + S13.7 corollary + spec §12.1): after
   `gh pr create`, the session must observe via `gh pr checks` that the required `checks` run
   executed and concluded green on GitHub. A red or *absent* check is a stop signal — fix or
   `NEED_HUMAN`. Local-gate output never substitutes. Any CI-touching task's acceptance criterion
   is an observed green check on a PR, not a local command.
2. **WIP cap** (dev-workflow §4B, applies to both modes): at ≥3 open unmerged task PRs, stop
   taking tasks → `NEED_HUMAN: stack full — review bottom-up`. Overridable per-goal in HANDOFF.
3. **Stack maintenance protocol** (dev-workflow §3): fixes land on the lowest affected branch and
   propagate in ONE batched cascade pass, never per-fix; stacked PRs merge bottom-up with
   **merge commits, never squash/rebase**, deleting each head branch so GitHub auto-retargets.
4. **Mode A rails parity** (dev-workflow §4A + root `.claude/settings.json`): the root repo
   carries the deny-list (merges, reviews, force-push variants, history rewriting, `.env`
   read/write, `supabase link`/remote `db push`); blanket `gh pr *` allows are forbidden; Mode A
   works inside the same WIP cap; sustained multi-task throughput requires Mode B + S13 preflight.
5. **Bypass discipline** (S13.1): ruleset bypass roles must exclude every identity agents run
   under; until the S13.2 bot identity exists, the deny-list above is the mandatory compensating
   control and "agents never merge" stays absolute.
6. **S9.6 repo hygiene** (new control): env-file ignore patterns ship in the repo's first commit;
   `git add -A` is forbidden in fix commits on branches with stale `.gitignore` snapshots;
   gitleaks allowlists are commit- or fingerprint-scoped, never bare paths. (Code follow-up:
   re-scope `.gitleaks.toml`'s current path allowlist — tracked as a task, not done here.)

## Alternatives rejected

- **Required status checks alone** (ruleset-only enforcement): blocks bad *merges* but not bad
  *building* — the loop would still stack ten tasks on a dead pipeline before anyone noticed;
  the never-ran case needs an in-loop observation.
- **Rebase-based stack maintenance:** cleaner history, but requires force-push — structurally
  forbidden (S13.1), and force-push denial is load-bearing elsewhere.
- **A hard tasks-per-day limit for Mode A:** arbitrary and unenforceable; the WIP cap bounds the
  same risk mechanically and scales with review bandwidth.
- **Waiting for the bot PAT before adding local denies:** leaves `gh pr merge` prompt-free under
  the owner's identity in the meantime — the hole this ADR exists to close.

## Consequences

- Throughput throttles to review bandwidth by design; the stack can never again grow ten deep
  unreviewed. One extra `gh pr checks` call per task.
- The root deny-list also binds Devesh's own interactive sessions (e.g., `.env` reads prompt);
  accepted — S13.3's "nothing to cat" spirit, and overridable per-prompt by the human.
- Squash-merge is off the table for stacked PRs; history carries merge commits (accepted cost —
  the alternative breaks the stack).

## Reversal trigger

Merge-queue tooling (or a second reviewer) replaces the WIP cap number; the S13.2 bot identity
landing retires the bypass-discipline compensating controls (the deny-list stays as friction).
