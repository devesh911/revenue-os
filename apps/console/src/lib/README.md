# lib — framework-free utilities

Small, side-effect-light helpers the app boots on:

- `env.ts` — `parseConsoleEnv(raw)` validates `import.meta.env` at the boundary (R6/Zod) and returns
  a discriminated result (ok + the parsed env, or the NAMES of the invalid vars for the config-error
  screen). Pure: the caller passes `raw`, so it stays importable with no env present.
- `supabase.ts` — `getSupabase()`, a LAZY, memoized client getter. Importing this module builds
  NOTHING (no module-scope `createClient`), so it is safe on `main.tsx`'s static import graph even
  when env is absent. This boot-honesty constraint is pinned by `tests/console-boot-honesty`.
- `api.ts` — the console-side `api<T>()` client: base URL from env, bearer token from Supabase,
  response Zod-parsed through the shared `apiFetch` wrapper, which throws a typed `ApiError`
  (status, method, path, the server's `error` code; status 0 = timeout / network). Pass the
  queryFn's `signal` so TanStack Query can cancel the request.
- `query.ts` — the QueryClient policy: `shouldRetry` (retry 5xx and no-answer at most twice, never
  a 4xx) and `createQueryClient({ onUnauthorized })` (any query or mutation failing with 401 calls
  it — the app signs this device out).

Boot-honesty rule: nothing here may construct a client or read a required secret at module scope.
