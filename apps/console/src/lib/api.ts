// Console-side binding of the shared apiFetch wrapper: base URL from env, token from Supabase.
import { apiFetch } from "@revenue-os/shared";
import type { z } from "zod";
import { getSupabase } from "./supabase";

// Base URL for the app API. Exported so views (e.g. OrgHomeView) can name it in an
// unreachable-backend message without re-reading env. `||` (not `??`) so an empty-string env var
// falls back too — API_URL is never "", which would render "Can't reach the API at .".
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { data } = await getSupabase().auth.getSession();
  return apiFetch(API_URL, path, schema, {
    ...opts,
    token: data.session?.access_token,
  });
}
