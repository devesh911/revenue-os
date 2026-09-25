// The ~30-line typed fetch wrapper (platform fetch + Zod, axios rejected: docs/tech-stack.md T24).
// Every response is schema-parsed — the console never trusts wire shapes (Zod at every boundary:
// docs/tech-stack.md T11).
// Failures throw ApiError, so callers can tell signed-out (401) from forbidden from a server fault
// from no answer at all (status 0: code "timeout" or "network"). A caller's own abort (TanStack
// Query cancelling) is rethrown as-is — it is not a failure to report.
// G1: runtime-agnostic.
import { z } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly code?: string,
  ) {
    super(`api ${method} ${path} failed: ${status}${code ? ` ${code}` : ""}`);
    this.name = "ApiError";
  }
}

const ErrorBody = z.object({ error: z.string() });

export async function apiFetch<T>(
  baseUrl: string,
  path: string,
  schema: z.ZodType<T>,
  opts: {
    method?: string;
    body?: unknown;
    token?: string;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const doFetch = opts.fetchImpl ?? fetch;
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 15_000);

  let res: Response;
  try {
    res = await doFetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
    });
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    const code = timeout.aborted ? "timeout" : "network";
    throw new ApiError(0, method, path, code);
  }
  if (!res.ok) {
    const body = ErrorBody.safeParse(await res.json().catch(() => null));
    throw new ApiError(res.status, method, path, body.data?.error);
  }
  // The timeout also covers reading the body: a stalled body is "timeout" too, not a raw DOMException.
  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    if (timeout.aborted && !opts.signal?.aborted)
      throw new ApiError(0, method, path, "timeout");
    throw err;
  }
  return schema.parse(body);
}
