// The ~30-line typed fetch wrapper (T24: platform fetch + Zod, axios rejected).
// Every response is schema-parsed — the console never trusts wire shapes (R6/T11).
// G1: runtime-agnostic.
import type { z } from "zod";

export async function apiFetch<T>(
  baseUrl: string,
  path: string,
  schema: z.ZodType<T>,
  opts: {
    method?: string;
    body?: unknown;
    token?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<T> {
  const doFetch = opts.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;

  const res = await doFetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (!res.ok)
    throw new Error(
      `api ${opts.method ?? "GET"} ${path} failed: ${res.status}`,
    );
  return schema.parse(await res.json());
}
