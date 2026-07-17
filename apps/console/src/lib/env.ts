// Console env validated at the boundary (R6/Zod) before boot. Pure and side-effect-free — the
// caller passes `raw` (import.meta.env), this never reads it — so it stays importable in tests
// with no env present. Returns a discriminated result: ok with the parsed env, or the NAMES of
// the invalid vars for the configuration-error screen. VITE_SUPABASE_URL must be a valid URL, so
// a present-but-garbage URL is caught here rather than thrown inside createClient (mirrors
// services/worker/src/env.ts); VITE_SUPABASE_ANON_KEY must be non-empty. Absent/empty/garbage all
// count as missing. Both VITE_SUPABASE_* rules are identical in dev and prod.
//
// VITE_API_URL is PROD-conditional (task-24): vite injects raw.PROD=true in production builds and
// false/undefined in dev. In PROD it must be a valid URL — otherwise lib/api.ts silently bakes its
// "http://localhost:8080" fallback and points a deployed console at nowhere, so a misconfigured
// prod build fails loudly on the ConfigErrorScreen instead. In DEV it stays OPTIONAL because that
// localhost fallback is exactly what local dev wants.
import { z } from "zod";

const ConsoleEnv = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
});

export type ConsoleEnv = z.infer<typeof ConsoleEnv>;

export type ParseConsoleEnvResult =
  | { ok: true; env: ConsoleEnv }
  | { ok: false; missing: string[] };

export function parseConsoleEnv(
  raw: Record<string, unknown>,
): ParseConsoleEnvResult {
  const apiUrl = z.string().url();
  const schema = ConsoleEnv.extend({
    VITE_API_URL: raw.PROD === true ? apiUrl : apiUrl.optional(),
  });
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, env: parsed.data };
  const missing = [
    ...new Set(
      parsed.error.issues
        .map((issue) => issue.path[0])
        .filter((key): key is string => typeof key === "string"),
    ),
  ];
  return { ok: false, missing };
}
