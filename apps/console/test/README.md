# test — the console's own suites

Component and unit tests for this app, env-free by construction (`bun test` +
`renderToStaticMarkup` / `Bun.file`, no DOM library, no DB or network, no new deps):

- `ui-smoke.test.tsx` — primitives render their token classes; every icon renders; AppShell draws
  the grouped nav.
- `data-shell.test.tsx`, `table.test.tsx`, `ui-contract.test.tsx` — the DataShell + Table
  primitives, their barrel exports, and the `ui/README.md` contract.
- `pages-adoption-tasks-agents-settings.test.tsx` — Tasks + Settings adopt the DataShell/Table
  primitives (source pins) with their loading/error/empty/happy copy preserved; Agents stays an
  honest static shell (no data source ⇒ no fabricated states).
- `sidebar-grouping.test.tsx` — the routes manifest groups the sidebar correctly.
- `readme-coverage.test.ts` — the self-explanatory-repo guard: every console folder that holds
  source or tests carries a README with real content (≥3 non-empty lines).
- `test-utils.ts` — shared helpers the primitive suites import (`visible()` strip-tags +
  `asPrimitivesMap()` barrel cast); not a test itself.
- `router.tsx` — a static SSR Router harness the leaf tests render inside (not a test itself).

Run: `bun test apps/console/test/`. App-boot and RLS/security behaviors that need env or a DB live
in the repo-level `tests/` (e.g. `tests/console-boot-honesty.test.tsx`), not here.
