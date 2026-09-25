// Dependency-free on purpose: the dev login imports it, and Playwright loads the dev login under Node
// (auth.e2e.ts, e2e/global-setup.ts), where the Bun-only `import.meta` of local-env.ts cannot load.

/** True only when the URL's host IS the local machine — look-alikes such as 127.0.0.1.evil.example fail,
 *  and so does a `?host=` / `?hostaddr=` override, which the pg driver prefers over the URL's host. */
export function isLocalUrl(url: string): boolean {
  try {
    const { hostname, searchParams } = new URL(url);
    if (searchParams.has("host") || searchParams.has("hostaddr")) return false;
    return hostname === "127.0.0.1" || hostname === "localhost";
  } catch {
    return false;
  }
}
