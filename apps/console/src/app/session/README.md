# session — who is signed in, and the sign-in front door

Accounts are invite-only (no sign-up UI); sign-in is email + password through the Supabase SDK,
which owns the tokens (`docs/security.md` S7.2). This folder mirrors the session and gates the app
on it:

- `SessionProvider.tsx` — the session context (`useSession()` → `{ state, signedOutByUser, signOut }`).
  Subscribes to `onAuthStateChange` in an effect (its first event, `INITIAL_SESSION`, replaces a
  separate `getSession`), runs `reduceAuth`, and wipes the query cache when it says so. `signOut`
  signs out THIS device only and marks the sign-out deliberate. `initialState` lets tests pin the
  state; `client` defaults to the lazy `getSupabase()`, resolved inside the effect.
- `RequireSession.tsx` — the gate around every page but `/login`: loading → neutral, signed out →
  `/login?next=<where they were going>` (plain `/login` after a deliberate sign-out), signed in →
  the app, keyed by user so a user switch remounts on a clean cache.
- `LoginPage.tsx` (container) + `LoginView.tsx` (pure form) — the public `/login` route. Signed in
  → on to `safeNext(next)`.
- Pure rules, unit-tested in `test/session-rules.test.ts`: `safe-next.ts` (only same-site
  destinations, never `/login`), `sign-in-errors.ts` (fixed copy, never the provider's message),
  `auth-state.ts` (the state machine and when the cache is wiped).
