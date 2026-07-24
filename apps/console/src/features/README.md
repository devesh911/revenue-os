# features — the data layer

Server state lives here, never in pages. Each domain is a module of TanStack Query hooks
(`conversations/api.ts`, `orgs/api.ts`, `screens/api.ts`) whose responses are parsed with Zod at
the boundary (R6): the hook's `data` type is `z.infer` of that schema, never a hand-written shape.
Query keys come from each module's `queryKeys` factory (R2).

No JSX belongs here EXCEPT a presentational component colocated with the domain it renders — e.g.
`conversations/TranscriptView.tsx`, which turns parsed transcript messages into inert, escaped text
nodes (S7.1). Such leaves stay prop-driven and env-free (no query hooks, no `lib/supabase`) so they
render under `renderToStaticMarkup` in unit tests.

The R2/R6 boundary: fetch + Zod-parse here; compose + present in `pages/` and `ui/`. A page that
reaches for `fetch` or re-declares a response shape is a layering bug.
