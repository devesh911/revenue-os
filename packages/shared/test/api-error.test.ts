// Console sign-in front door — RED spec for the typed API error (AC-C5). apiFetch must throw an
// ApiError that says WHAT failed (status, method, path, and the server's JSON `error` code when it
// sends one), so the console can tell "signed out" (401) from "forbidden" from "server broke" from
// "offline"; a hung request must be cut off after timeoutMs; and a caller's AbortSignal (TanStack
// Query's cancellation) must cancel the request. Status 0 is the "never got an HTTP answer" status.
// The three pre-existing cases in api-fetch.test.ts stay as they are: ApiError extends Error and
// the non-2xx message must still name the status (/500/).
// Loaded per test (dynamic import + cast) so, until ApiError is exported, each case fails on its own
// "ApiError is exported" assertion rather than a whole-file link error.
import { describe, expect, it } from "bun:test";
import { z } from "zod";

type ApiErrorShape = Error & {
  status: number;
  code?: string;
  method: string;
  path: string;
};
type FetchOpts = {
  method?: string;
  body?: unknown;
  token?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
};
type Shared = {
  ApiError: abstract new (...args: never[]) => ApiErrorShape;
  apiFetch: <T>(
    base: string,
    path: string,
    schema: z.ZodType<T>,
    opts?: FetchOpts,
  ) => Promise<T>;
};

const BASE = "https://api.example.com";

async function load(): Promise<Shared> {
  const mod = (await import("../src")) as Partial<Shared>;
  expect(typeof mod.ApiError).toBe("function"); // RED today: ApiError is not exported yet
  return mod as Shared;
}

// Settle `p` within `ms`: returns the rejection, or fails with a clean assertion if it resolved or
// is still pending (a missing timeout must fail here, not by hanging the runner).
async function rejectionOf(p: Promise<unknown>, ms = 1000): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outcome = await Promise.race([
    p.then(
      () => ({ kind: "resolved" as const, error: undefined }),
      (error: unknown) => ({ kind: "rejected" as const, error }),
    ),
    new Promise<{ kind: "pending"; error: undefined }>((resolve) => {
      timer = setTimeout(
        () => resolve({ kind: "pending", error: undefined }),
        ms,
      );
    }),
  ]);
  clearTimeout(timer);
  expect(outcome.kind).toBe("rejected");
  return outcome.error;
}

// A fetch whose server never answers: it settles ONLY when its signal aborts (as real fetch does),
// and records the signal it was handed so a test can prove the request itself was cancelled.
function hangingFetch(): {
  fetchImpl: typeof fetch;
  signal: () => AbortSignal | undefined;
} {
  let seen: AbortSignal | undefined;
  const fetchImpl = ((_input: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      seen = init?.signal ?? undefined;
      seen?.addEventListener("abort", () =>
        reject(seen?.reason ?? new DOMException("aborted", "AbortError")),
      );
    })) as unknown as typeof fetch;
  return { fetchImpl, signal: () => seen };
}

describe("apiFetch → ApiError (console sign-in front door)", () => {
  // AC-C5 — non-2xx with a JSON {error} body → ApiError carrying status, method, path and code.
  it("AC-C5: a non-2xx JSON error body becomes an ApiError with status, method, path and code", async () => {
    const { ApiError, apiFetch } = await load();
    const fetchImpl = (async () =>
      Response.json(
        { error: "forbidden" },
        { status: 403 },
      )) as unknown as typeof fetch;
    const err = await rejectionOf(
      apiFetch(BASE, "/orgs/abc/contacts", z.unknown(), {
        method: "POST",
        body: { a: 1 },
        fetchImpl,
      }),
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({
      status: 403,
      method: "POST",
      path: "/orgs/abc/contacts",
      code: "forbidden",
    });
  });

  // AC-C5 — a non-JSON (or code-less JSON) error body still yields an ApiError, with code undefined.
  it("AC-C5: a non-JSON or code-less error body still gives an ApiError with code undefined", async () => {
    const { ApiError, apiFetch } = await load();
    const html = (async () =>
      new Response("<html>bad gateway</html>", {
        status: 502,
      })) as unknown as typeof fetch;
    const htmlErr = await rejectionOf(
      apiFetch(BASE, "/orgs", z.unknown(), { fetchImpl: html }),
    );
    expect(htmlErr).toBeInstanceOf(ApiError);
    expect(htmlErr).toMatchObject({
      status: 502,
      method: "GET",
      path: "/orgs",
    });
    expect((htmlErr as ApiErrorShape).code).toBeUndefined();

    const noCode = (async () =>
      Response.json(
        { detail: "nope" },
        { status: 400 },
      )) as unknown as typeof fetch;
    const noCodeErr = await rejectionOf(
      apiFetch(BASE, "/orgs", z.unknown(), { fetchImpl: noCode }),
    );
    expect(noCodeErr).toBeInstanceOf(ApiError);
    expect((noCodeErr as ApiErrorShape).status).toBe(400);
    expect((noCodeErr as ApiErrorShape).code).toBeUndefined();
  });

  // AC-C5 — a server that never answers is aborted after timeoutMs → ApiError status 0, code "timeout".
  it("AC-C5: a request that never answers is aborted after timeoutMs → ApiError status 0 code 'timeout'", async () => {
    const { ApiError, apiFetch } = await load();
    const hang = hangingFetch();
    const err = await rejectionOf(
      apiFetch(BASE, "/orgs", z.unknown(), {
        fetchImpl: hang.fetchImpl,
        timeoutMs: 20,
      }),
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 0,
      code: "timeout",
      method: "GET",
      path: "/orgs",
    });
    expect(hang.signal()?.aborted).toBe(true); // the request itself was cancelled, not just abandoned
  });

  // AC-C5 — a rejected fetch (offline / DNS / CORS: TypeError) → ApiError status 0, code "network".
  it("AC-C5: a rejected fetch (TypeError) becomes ApiError status 0 code 'network'", async () => {
    const { ApiError, apiFetch } = await load();
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const err = await rejectionOf(
      apiFetch(BASE, "/orgs", z.unknown(), { fetchImpl: offline }),
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 0,
      code: "network",
      method: "GET",
      path: "/orgs",
    });
  });

  // AC-C5 — the caller's opts.signal aborting (e.g. TanStack Query cancelling) aborts the request.
  it("AC-C5: an external opts.signal abort also aborts the request (and is not reported as a timeout)", async () => {
    const { apiFetch } = await load();
    const hang = hangingFetch();
    const controller = new AbortController();
    const pending = apiFetch(BASE, "/orgs", z.unknown(), {
      fetchImpl: hang.fetchImpl,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 10);
    const err = await rejectionOf(pending);
    expect(hang.signal()?.aborted).toBe(true);
    expect((err as { code?: unknown }).code).not.toBe("timeout"); // default 15s timer never fired
  });

  // AC-C5 — the success path still schema-parses when the new options are in play (a guard: green
  // today, must stay green through the change).
  it("AC-C5: success still returns the schema-parsed body (with timeoutMs and signal set)", async () => {
    const { apiFetch } = (await import("../src")) as Shared;
    const ok = (async () =>
      Response.json({ ok: true, extra: "dropped" })) as unknown as typeof fetch;
    const out = await apiFetch(
      BASE,
      "/orgs",
      z.object({ ok: z.literal(true) }),
      {
        fetchImpl: ok,
        timeoutMs: 1000,
        signal: new AbortController().signal,
      },
    );
    expect(out).toEqual({ ok: true });
  });
});
