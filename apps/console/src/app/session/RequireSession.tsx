// The session gate (S7.5) around every page but /login. Signed out → /login, carrying where the
// visitor was going as `next` — unless they signed out on purpose (then plain /login). Keyed by
// user, so a different user signing in (e.g. in another tab) remounts the tree on the wiped cache.
// UI only: the API checks the token on every call.
import { Fragment, type ReactNode } from "react";
import { Redirect, useLocation, useSearch } from "wouter";
import { useSession } from "./SessionProvider";

// Neutral while the session is still unknown: neither the sign-in form nor protected content.
export const SessionLoading = () => (
  <div className="p-8 text-sm text-muted">Loading…</div>
);

export function RequireSession({ children }: { children: ReactNode }) {
  const { state, signedOutByUser } = useSession();
  const [path] = useLocation();
  const search = useSearch();
  if (state.status === "loading") return <SessionLoading />;
  if (state.status === "signedOut") {
    const here = search ? `${path}?${search}` : path;
    const next =
      signedOutByUser || here === "/"
        ? ""
        : `?next=${encodeURIComponent(here)}`;
    return <Redirect replace to={`/login${next}`} />;
  }
  return <Fragment key={state.userId}>{children}</Fragment>;
}
