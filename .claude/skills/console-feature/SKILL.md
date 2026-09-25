---
name: console-feature
description: Use BEFORE building or changing anything in apps/console — screens, components, hooks, data fetching, forms, custom fields. Routes to the console patterns, the rules below, and the S7 frontend security controls.
---

# console-feature — thin router (AGENTS.md is the rulebook; docs/ is reference)

## Read first, in this order
1. `docs/patterns/tanstack-query.md` · `docs/patterns/react-component.md` · `docs/patterns/zod-boundary.md`.
2. `ROADMAP.md` — which console work the current slice actually needs (scope discipline) · `AGENTS.md` → write ownership.
3. `docs/security.md` S7 — S7.1 (tenant text renders as text nodes; a test exists) · S7.2 (PKCE via the SDK) · S7.3 (zero secrets in the build) · S7.5 (auth guard + server-side checks; UI hiding is not access control).

## The rules you will be reviewed against
- **R1**: pages compose features; a feature never imports another feature (share through `packages/shared` or lift to the page).
- **R2**: ALL server state via TanStack Query hooks in `features/*/api.ts`, keys from the single queryKeys factory — **no `useEffect` data-fetching, ever**.
- **R5/R6**: shapes imported from `packages/shared`, never re-declared; enum copy comes from seed tables, not string literals. (`<DynamicField/>` for custom fields is planned, not built.)
- **R7**: server→TanStack · local UI→`useState` · shareable→URL (wouter params). No global store without a `STATE.md` decision line.
- **R3/R4/R8**: watched mutations are optimistic-with-rollback; components ≤150 lines, typed props, no fetching inside; error boundary per screen; loading/empty/error states are part of Done.
- Console never imports `packages/harness`; it writes only its D21 set (tasks status, dispositions tagging, org config, agent/workflow drafts, KB).

## Commands
`bun run dev:console` · `bun run typecheck` (covers the console project) · `bun test` · e2e = `bun run e2e` (Playwright smoke, apps/console/e2e/smoke.e2e.ts; not yet run in CI).

## Learned since this router was written (dynamic — run it, don't skip)
`grep -inE 'console|react|tanstack|xss|S7|browser|cors|vite' lessons.md` and read `STATE.md → Decisions in force`.
Findings there outrank this file; on contradiction follow the lesson and note that this skill needs a refresh.

## Before you finish
AGENTS.md → Definition of done, including one real-browser check of the screen. No `dangerouslySetInnerHTML` (S7.1).
