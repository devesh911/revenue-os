# D34 — Obligation traceability, residual protocol, §13 triage, cross-reference rule (DRAFT — awaiting Devesh's merge per dev-workflow §13)

**Status:** Draft, from the 2026-07-10 P0 shakedown audit. Not law until merged.
**Affected law-docs (edited in this PR):** project-spec.md (§0, §12 preamble, new §12b) · dev-workflow.md (§6, §13).

## Context

Four related failures surfaced when all ten P0 tasks completed in one day:

1. **"All tasks done" ≠ "P0 obligations met."** T14 and S12.1 mandate per-PR CI stages —
   dependency audit, the S1.2 `service_role` grep-guard, the S7.3 `dist/` secret grep, image
   build — that no task in §12 implements and the actual `ci.yml` lacks. Nothing maps controls
   to owning tasks, so the deltas are invisible: nobody can tell a deliberate phase-deferral
   from a silent drop.
2. **Tasks closed "done" with unmet criteria.** Task 8 ("real call transcribed") and task 10
   ("deployed on Pages/VPS") need Devesh-held resources. The sessions improvised ⚠ markers in
   PR bodies and HANDOFF; the docs define no such state, so the convention exists only as habit.
3. **Doc-vs-doc drift.** Task 2's scope was stated three conflicting ways because the db-design
   §13/§14 addenda changed file counts that other docs cite, and no rule required patching the
   citations (fixed factually by D33; the *rule* preventing recurrence lands here).
4. **No triage for doc bugs.** Eleven lessons.md entries queued in one day behind a single
   weekly ADR pass, with blocking defects (task cannot proceed as written) and cosmetic notes
   in the same undifferentiated queue.

## Decision

1. **§12b traceability table** (project-spec): every doc-mandated obligation without an owning
   task gets a row (obligation · source id · owner · status). Rows enter when an ADR/law creates
   an unowned obligation; rows leave only via a merged task PR or an explicit descope ADR. The
   initial table names the CI-parity delta (proposed **task 11**), the phase-deferred test
   layers, the two open residuals, and the deploy pipeline (task 14).
2. **Residual protocol** (spec §12 preamble + dev-workflow §6): acceptance criteria are classed
   agent-verifiable vs human-gated; human-gated leftovers close the task as *done (residual: …)*,
   declared under ⚠ in the PR body, mirrored in HANDOFF ESCALATIONS, and tracked in §12b until
   the named human action closes them.
3. **§13 triage lane** (dev-workflow): blocking doc bug → mini-ADR PR immediately (task PR links
   it); cosmetic → Friday batch. The lessons.md entry always lands first.
4. **Cross-reference rule** (spec §0): a change altering facts other docs cite patches every
   citing doc in the same PR — citations are part of the change surface.

## Alternatives rejected

- **A standalone `docs/traceability.md`:** a sixth law-doc changes the "docs are law" enumeration
  in CLAUDE.md and adds a file nobody opens; §12 is where the backlog already lives.
- **Tracking residuals only in HANDOFF:** HANDOFF is orchestrator state, wiped/rewritten per
  goal — obligations need a home in law, not in session state.
- **Treating every doc bug as blocking:** eleven immediate ADR PRs in one day would have stalled
  the build; triage keeps the valve proportionate.

## Consequences

- Small standing maintenance cost: ADRs that create obligations must also place them (a row or
  an owning task) — that cost *is* the feature.
- The proposed task 11 (CI parity) enters the backlog by this merge; scheduling stays Devesh's.
- §12's task list becomes the single audit surface for "what remains before a phase exits."

## Reversal trigger

If the table outgrows §12 (multi-phase sprawl, >~30 rows), promote it to a generated report from
task metadata — reopen via ADR then, not before.
