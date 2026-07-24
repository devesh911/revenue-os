# Console

The operator console — the calm **tool** surface of the two-surface design system (the other
surface is the marketing site in `apps/www`). It is the workspace where a human operator watches
live conversations, works the task queue, and reads contact timelines for their org.

Stack: a Vite + React single-page app (React 19, wouter for routing, TanStack Query for server
state, supabase-js for auth, Zod at every boundary, Tailwind tokens). No SSR — it boots against
the app API and Supabase, and org context lives in the URL (`/o/:orgId/…`).

Folder map: **[`src/README.md`](src/README.md)** is the authoritative layer map for `src/` — each
folder plus the `routes.tsx` manifest. The sibling `test/` holds this app's env-free unit suites
(see [`test/README.md`](test/README.md)). Kept in one place so the map never drifts against a copy.

Run and test (from the repo root):

- `bun run dev:console` — local dev server (Vite).
- `bun run --filter console build` — production build.
- `bun test apps/console/test/` — this app's env-free unit suites.

The styling contract is **`src/ui/README.md`** — read it before touching any page or primitive.
The visual source of truth is the claude.ai **"Revenue OS Design System"** project; `ui/` is its
code form.
