---
name: console-feature
description: Use BEFORE building or changing anything in apps/console — screens, components, hooks, data fetching, forms, custom fields. Routes to dev-workflow §1b R1–R9, the TanStack/DynamicField patterns, and the S7 frontend security controls.
---

# console-feature — thin router (skills advise, docs rule — AGENTS.md)

## Read first, in this order
1. `docs/dev-workflow.md` §1b — console architecture + **R1–R9** (every one is review-blocking).
2. `docs/patterns/tanstack-query.md` · `docs/patterns/react-component.md` · `docs/patterns/zod-boundary.md`.
3. `docs/project-spec.md` §4.E — the four screens (scope discipline) · §7 — console's write set (D21).
4. `docs/security.md` S7 — S7.1 (tenant text renders as text nodes; a test exists) · S7.2 (PKCE via the SDK) · S7.3 (zero secrets in the build) · S7.5 (auth guard + server-side checks; UI hiding is not access control).

## The rules you will be reviewed against
- **R2**: ALL server state via TanStack Query hooks in `features/*/api.ts`, keys from the single queryKeys factory — **no `useEffect` data-fetching, ever**.
- **R5/R6**: custom fields render through one `<DynamicField/>`; shapes imported from `packages/shared`, never re-declared; enum copy comes from seed tables, not string literals.
- **R7**: server→TanStack · local UI→`useState` · shareable→URL (wouter params). No global store without an ADR.
- **R3/R4/R8**: watched mutations are optimistic-with-rollback; components ≤150 lines, typed props, no fetching inside; error boundary per screen; loading/empty/error states are part of Done.
- Console never imports `packages/harness`; it writes only its D21 set (tasks status, dispositions tagging, org config, agent/workflow drafts, KB).

## Commands
`bun run dev:console` · `bun run typecheck` (covers the console project) · `bun test` · e2e = Playwright smoke (T12 — lands with P3 screen work).

## Before you finish
Dev-workflow §6 DoD, including the line "frontend: R1–R9 respected". No `dangerouslySetInnerHTML` (S7.1). Contradiction found → `lessons.md` + §13 triage.
