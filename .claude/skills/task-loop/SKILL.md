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
2. Branch off the stack tip: `feat/task-NN-slug`.
3. **RED before GREEN** — failing tests from the acceptance criteria. Security/RLS/migration/guard-critical: the reviewer authors them itself (test-is-spec).
4. Gates: `bun test` · `bun run lint` · `bun run typecheck` · `bun run rls:check` when the DB is touched.
5. Push · `gh pr create` with the §6 checklist + a **⚠ residuals block** for human-gated criteria (D34).
6. **Verify the pipeline RAN:** `gh pr checks <N>` must show the required `checks` run concluded green **on GitHub**. An absent or red check is a stop signal — fix it or emit `NEED_HUMAN` (S13.7/D32). Local gate output never substitutes.
7. Update HANDOFF (incl. ESCALATIONS mirroring any `lessons.md` append) · checkpoint the orchestrator repo · take the next task or emit the sentinel. Never idle; never exceed the cap.

## Never (structural, not advisory — dev-workflow §12, S13)
Merge or approve anything · edit `docs/**`, `CLAUDE.md`, or applied migrations (blocking doc bug ⇒ §13 mini-ADR via the doc-change skill) · touch `.env`/secrets · force-push · add a dependency without a T24 BOM row · mutate an active agent/workflow version.

## Merge discipline (human-only; cite when asked)
Stacked PRs merge ONE at a time · confirm the base retargeted to `main` before each (`gh pr view N --json baseRefName`) · merge commits, never squash · never loop `gh pr merge` (lessons.md, 2026-07-10).
