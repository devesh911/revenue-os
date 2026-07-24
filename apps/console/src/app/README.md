# app — shell and wiring

The mounted app tree and everything that is NOT a page:

- `App.tsx` — providers + auth guard + router, kept out of `main.tsx` so the boot entry stays a thin
  env gate. `lib/supabase` is lazy, so importing this tree builds no client (boot honesty).
- `router.tsx` — the wouter routes behind the auth guard. It reads the `routes.tsx` manifest and
  mounts the `AppShell` chrome ONCE around an inner `<Switch>`, so navigation swaps only the content
  pane. Sign-out lives here (not in `ui/`) to keep `ui/` Supabase-free.
- `auth.tsx` — the session guard (S7.5): no session → login form; session → children.
- `AppErrorBoundary.tsx`, `ConfigErrorScreen.tsx` — the render error boundary and the missing-env
  configuration screen.
- `OrgHomeView`, `OrgSwitcher` / `OrgSwitcherView`, `UserChip` — org selection and the topbar
  identity chrome.

ROUTER-ONLY `AppShell` rule: only `router.tsx` mounts `AppShell`. A page must never import it — the
router already wraps every routed element and would double-render the chrome (see `../ui/README.md`).
