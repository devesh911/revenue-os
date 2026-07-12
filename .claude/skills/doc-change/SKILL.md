---
name: doc-change
description: Use whenever a doc contradiction, gap, or needed amendment appears — the §13 decision protocol end to end: lessons.md first, triage, ADR drafting, law-doc edits in the same PR, cross-reference patching, Devesh's merge.
---

# doc-change — thin router (skills advise, docs rule — CLAUDE.md)

## Read first, in this order
1. `docs/dev-workflow.md` §13 — the decision protocol + the D34 triage lane.
2. `docs/decisions/README.md` — ADR shape and D-id assignment (next free id across spec §3's log AND `docs/decisions/`; ids are append-only, never reused).
3. `docs/project-spec.md` §0 — ID registry + the **cross-reference rule**: a change that alters facts other docs cite patches every citing doc in the same PR.

## The protocol
1. **`lessons.md` first, always** — append-only: `date · task · finding · suggested doc change`. In Mode B, mirror to HANDOFF ESCALATIONS.
2. **Triage (D34):** *blocking* (the task cannot proceed as documented) ⇒ draft the mini-ADR PR immediately and link it from the task PR · *cosmetic* ⇒ the Friday batch (§11).
3. **Draft** = `docs/decisions/D<next>-slug.md` (Context · Decision · Alternatives · Consequences · Reversal trigger) **plus**, in the SAME PR: the law-doc edits, the citing-doc patches (§0), and a `project-spec §12b` row if the change creates an obligation without an owning task (D34).
4. Open the PR against `main`. Merge follows the PHASE rule (D36, STATE.md line 1): SETUP — if
   Devesh commissioned the change in-session, merge on observed green; otherwise mark the ADR
   `DRAFT — awaiting Devesh's merge` and stop. LIVE — CODEOWNERS routes `docs/**` to Devesh;
   **only his merge makes it law**, always.

## Never
Edit `docs/**` or `CLAUDE.md` outside such a PR · renumber or reuse D/T/S/G ids (§0) · treat a lessons.md entry as law (lessons are findings; merged ADRs are decisions) · bundle unrelated code into a decision PR.

## Reference examples in the repo
`docs/decisions/D33-*` (execution-truth alignment) · `D34-*` (protocol change with §12b) · `D35-*` (constraint discovered by tooling). Imitate their shape.

## Learned since this router was written (dynamic — run it, don't skip)
`grep -inE 'doc|ADR|§13|spec|contradiction' lessons.md` and read `STATE.md → DECISIONS` — under the v2 operating model (AGENTS.md), docs are reference and STATE.md DECISIONS is where open forks live; several lessons entries are themselves pending doc amendments. Findings there outrank this file.
