// Zod-parsed process env (T11) — the worker refuses to boot half-configured.
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL missing — app_service connection string"),
  SUPABASE_URL: z.string().url(),
});

export const env = EnvSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  SUPABASE_URL: process.env.SUPABASE_URL,
});
