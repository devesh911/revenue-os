// Where to send someone after sign-in: only a same-site path, never another site (an open
// redirect) and never /login itself (a loop). The browser's own URL parser decides, so whatever
// it would strip or reinterpret ("\" as "/", tabs, newlines, leading spaces) is judged as the
// browser would read it; anything off-site or unparseable falls back to "/". A path that is still
// "//host" after dot segments collapse ("/.//evil.com") is protocol-relative, so it is off-site too.
const ORIGIN = "http://console.invalid";

export function safeNext(raw: string | null | undefined): string {
  if (!raw) return "/";
  try {
    const url = new URL(raw, ORIGIN);
    if (
      url.origin !== ORIGIN ||
      url.pathname.startsWith("//") ||
      url.pathname === "/login"
    )
      return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
