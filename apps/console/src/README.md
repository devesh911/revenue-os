# src — the console source, in layers

The console is built in strict layers; each folder has one job and depends only downward. Read a
folder's own README before working in it.

- `app/` — the shell and wiring: boot, providers, auth guard, and the router. Nothing here renders
  page content; it mounts the chrome and hands off to a page.
- `routes.tsx` — THE route manifest. Pages self-register with one appended entry; the Sidebar (nav)
  and the router both read this array, so one entry = a fully wired page.
- `pages/` — composition: one folder per routed page, assembled from `ui/` primitives and
  `features/` hooks. Pages never define styles.
- `features/` — the data layer: Zod-parsed TanStack Query hooks, one module per domain.
- `ui/` — presentation: tokens, primitives, layout, icons. The design-system contract is
  `ui/README.md`; pages compose it and never redefine colors, spacing, or components.
- `lib/` — framework-free utilities: env parsing, the lazy Supabase getter, the API client.
- `screens/` — legacy V1 screens, kept only because tests pin them (see `screens/README.md`).
