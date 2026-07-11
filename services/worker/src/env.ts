// Zod-parsed process env (T11) — the worker refuses to boot half-configured.
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL missing — app_service connection string"),
  SUPABASE_URL: z.string().url(),
  // Comma-separated browser origins allowed to call this API (S3/S4: explicit
  // allowlist, never "*"). Default = the local console; staging/prod set their own.
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((s) =>
      s
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    ),
});

export const env = EnvSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  SUPABASE_URL: process.env.SUPABASE_URL,
  CORS_ORIGINS: process.env.CORS_ORIGINS,
});
