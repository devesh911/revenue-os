# Repo hygiene — standing protocol

Four rules, each with a one-line why.

1. **HANDOFF is a resume point, not a journal.** At every goal-complete, move completed entries out
   of `orchestrator/state/HANDOFF.md` into `orchestrator/state/archive-YYYY-MM.md` — a resume point
   that keeps growing stops being fast to read at 3am.
2. **A "docs catch up later" DECISIONS line must name its owner-PR within the week it's recorded.**
   Undated debts rot — nobody remembers to pay them, and this PR itself exists to settle three that did.
3. **Stale branches/worktrees are swept at every checkpoint.** Merged branch tips are deleted with
   `-d` (never `-D` — a force-delete on an unmerged branch silently drops work); worktrees are
   removed via `git worktree remove`, never `rm -rf` — a manually deleted worktree directory leaves
   Git's internal bookkeeping stale and future `add`/`prune` calls confused.
4. **lessons.md is deduped monthly.** Recurring lessons graduate into a skill or a DECISIONS line;
   one-off trivia is deleted — an ever-growing append-only log stops being read once nobody trusts
   that the signal outweighs the noise.

---
Commissioned 2026-07-13 (docs-reconciliation PR); amend via normal PR.
