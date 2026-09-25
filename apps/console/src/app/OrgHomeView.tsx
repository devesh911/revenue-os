// Pure presentational view for the landing after sign-in — also the org
// shell's state while the workspace list isn't in hand. Every non-happy state is honest and offers
// a way forward: the API unreachable (names the API base — a dead backend must NOT masquerade as an
// empty account), any other failure, and no workspace yet (invite-only: ask your admin). No list
// yet reads as loading. Navigation on success is the container's job, so the has-orgs branch
// renders nothing. Side-effect-free and router-free (renders with no <Router>); no lib/api or
// lib/supabase.
import { ApiError } from "@revenue-os/shared";
import type { ReactNode } from "react";
import type { OrgListItem } from "../features/orgs/api";
import { Button, Card } from "../ui/primitives";

export function OrgHomeView({
  isLoading,
  isError,
  error,
  orgs,
  apiBase,
  onRetry,
  onSignOut,
}: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  orgs: OrgListItem[] | undefined;
  apiBase: string;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  const signOut = (
    <Button variant="secondary" onClick={onSignOut}>
      Sign out
    </Button>
  );
  if (isError) {
    const unreachable = error instanceof ApiError && error.status === 0;
    return (
      <Notice
        title={unreachable ? "API unreachable" : "Something went wrong"}
        body={
          unreachable
            ? `Can't reach the API at ${apiBase}. Check that the server is running, then retry.`
            : "Couldn't load your workspaces."
        }
      >
        <Button onClick={onRetry}>Retry</Button>
        {signOut}
      </Notice>
    );
  }
  if (isLoading || !orgs)
    return <div className="p-8 text-sm text-muted">Loading orgs…</div>;
  if (orgs.length === 0)
    return (
      <Notice
        title="You're not in a workspace yet"
        body="Ask your workspace admin to invite you."
      >
        {signOut}
      </Notice>
    );
  return null; // container redirects once an org exists
}

function Notice({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <Card padding="lg" className="w-full max-w-lg">
        <h1 className="text-h2 text-ink">{title}</h1>
        <p className="mt-2 text-sm text-muted">{body}</p>
        <div className="mt-5 flex gap-2">{children}</div>
      </Card>
    </div>
  );
}
