// The app's QueryClient policy. Retry only what can succeed on a second try — a server fault (5xx)
// or no answer at all (status 0) — at most twice; a 4xx or a bad payload is final. Any query or
// mutation failing with 401 means the session is gone server-side: onUnauthorized signs out.
import { ApiError } from "@revenue-os/shared";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

export function shouldRetry(failureCount: number, error: unknown): boolean {
  const transient =
    error instanceof ApiError && (error.status === 0 || error.status >= 500);
  return transient && failureCount < 2;
}

export function createQueryClient({
  onUnauthorized,
}: {
  onUnauthorized: () => void;
}): QueryClient {
  const onError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) onUnauthorized();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: { queries: { retry: shouldRetry } },
  });
}
