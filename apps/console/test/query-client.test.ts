// Console sign-in front door — RED spec for the app's query client. Two rules:
//   shouldRetry        retry only what can succeed on a second try: server errors (5xx) and
//                      "no answer" (status 0: offline / timeout), at most twice; never a 4xx —
//                      retrying "not signed in" / "forbidden" / "not found" only delays the truth;
//   createQueryClient  any query or mutation failing with 401 (the session is gone server-side)
//                      calls onUnauthorized — the app signs the user out — once per error.
// Real ApiErrors come from the shared apiFetch (apiErrorFor), so no constructor is guessed. Env-free.
import { describe, expect, it, mock } from "bun:test";
import { MutationObserver, type QueryClient } from "@tanstack/react-query";
import { apiErrorFor } from "./test-utils";

type QueryModule = {
  shouldRetry: (failureCount: number, error: unknown) => boolean;
  createQueryClient: (opts: { onUnauthorized: () => void }) => QueryClient;
};

const loadQuery = async () => (await import("../src/lib/query")) as QueryModule;

// A real ApiError for `status`, asserted to be one (so a rule can't pass on a plain Error).
async function apiError(status: number): Promise<unknown> {
  const err = await apiErrorFor(status);
  expect(err).toMatchObject({ status });
  return err;
}

describe("shouldRetry", () => {
  // Client errors are final: 400/401/403/404 are never retried.
  it("never retries an ApiError 400/401/403/404", async () => {
    const { shouldRetry } = await loadQuery();
    for (const status of [400, 401, 403, 404]) {
      expect(shouldRetry(0, await apiError(status))).toBe(false);
    }
  });

  // Server errors and no-answer (status 0) retry while failureCount < 2, then stop.
  it("retries ApiError 500 and status 0 while failureCount < 2, never at >= 2", async () => {
    const { shouldRetry } = await loadQuery();
    for (const status of [500, 0]) {
      const err = await apiError(status);
      expect(shouldRetry(0, err)).toBe(true);
      expect(shouldRetry(1, err)).toBe(true);
      expect(shouldRetry(2, err)).toBe(false);
      expect(shouldRetry(3, err)).toBe(false);
    }
  });
});

describe("createQueryClient — 401 signs the user out", () => {
  // A query failing with 401 calls onUnauthorized exactly once.
  it("a query rejecting with ApiError 401 calls onUnauthorized once", async () => {
    const { createQueryClient } = await loadQuery();
    const onUnauthorized = mock(() => {});
    const qc = createQueryClient({ onUnauthorized });
    const err = await apiError(401);
    await qc
      .fetchQuery({
        queryKey: ["ac-c6", 401],
        queryFn: () => Promise.reject(err),
      })
      .catch(() => {});
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    qc.clear();
  });

  // A 500 is an outage, not a lost session: onUnauthorized is not called.
  it("a query rejecting with ApiError 500 does not call onUnauthorized", async () => {
    const { createQueryClient } = await loadQuery();
    const onUnauthorized = mock(() => {});
    const qc = createQueryClient({ onUnauthorized });
    const err = await apiError(500);
    await qc
      .fetchQuery({
        queryKey: ["ac-c6", 500],
        queryFn: () => Promise.reject(err),
        retry: false, // skip the (correct) 500 retries' real back-off delay
      })
      .catch(() => {});
    expect(onUnauthorized).not.toHaveBeenCalled();
    qc.clear();
  });

  // A mutation failing with 401 calls onUnauthorized exactly once too.
  it("a mutation rejecting with ApiError 401 calls onUnauthorized once", async () => {
    const { createQueryClient } = await loadQuery();
    const onUnauthorized = mock(() => {});
    const qc = createQueryClient({ onUnauthorized });
    const err = await apiError(401);
    await new MutationObserver(qc, { mutationFn: () => Promise.reject(err) })
      .mutate()
      .catch(() => {});
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    qc.clear();
  });
});
