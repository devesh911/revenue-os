# app — shell and wiring

The mounted app tree and everything that is NOT a page:

- `App.tsx` — providers + session + router, kept out of `main.tsx` so the boot entry stays a thin
  env gate. Builds the QueryClient once (`lib/query.ts`: a 401 signs this device out). `lib/supabase`
  is lazy, so importing this tree builds no client (boot honesty).
- `router.tsx` — the wouter routes. `/login` is public; everything else sits behind the session
  gate, and the org-scoped shell also behind the membership gate. It reads the `routes.tsx`
  manifest and mounts the `AppShell` chrome ONCE around an inner `<Switch>`, so navigation swaps
  only the content pane. The `/` landing goes straight to the first workspace. Sign-out lives here
  (not in `ui/`) to keep `ui/` Supabase-free.
- `session/` — the session context, the sign-in page, and the session gate (see its README).
- `access/` — the workspace-membership gate and the no-access page (see its README).
- `AppErrorBoundary.tsx`, `ConfigErrorScreen.tsx` — the render error boundary and the missing-env
  configuration screen.
- `OrgHomeView` — the landing's honest states (no workspace yet · API unreachable · other failure,
  each with Retry / Sign out). `OrgSwitcher` / `OrgSwitcherView`, `UserChip` — org selection and the
  topbar identity chrome.

ROUTER-ONLY `AppShell` rule: only `router.tsx` mounts `AppShell`. A page must never import it — the
router already wraps every routed element and would double-render the chrome (see `../ui/README.md`).
