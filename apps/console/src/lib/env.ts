// Console env validated at the boundary (R6/Zod): both Supabase vars must be present AND
// non-empty before boot. Pure and side-effect-free — the caller passes `raw` (import.meta.env),
// this never reads it — so it stays importable in tests with no env present. Returns a
// discriminated result: ok with the parsed env, or the NAMES of the missing/empty vars for the
// configuration-error screen. Empty string counts as missing (min(1)).
import { z } from "zod";

const ConsoleEnv = z.object({
  VITE_SUPABASE_URL: z.string().min(1),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
});

export type ConsoleEnv = z.infer<typeof ConsoleEnv>;

export type ParseConsoleEnvResult =
  | { ok: true; env: ConsoleEnv }
  | { ok: false; missing: string[] };

export function parseConsoleEnv(
  raw: Record<string, unknown>,
): ParseConsoleEnvResult {
  const parsed = ConsoleEnv.safeParse(raw);
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
