// The session state machine fed by Supabase auth events. The session each event carries
// is the truth — the event name only says why it changed. The query cache is wiped whenever a
// signed-in user goes away (sign-out, or a different user signing in over them), so one person
// never sees another's data; the first session, token refreshes and profile updates keep it.
export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; userId: string; email: string | null };

type AuthSession = { user: { id: string; email?: string | null } } | null;

export function reduceAuth(
  prev: AuthState,
  _event: string,
  session: AuthSession,
): { next: AuthState; clearCache: boolean } {
  const next: AuthState = session
    ? {
        status: "signedIn",
        userId: session.user.id,
        email: session.user.email ?? null,
      }
    : { status: "signedOut" };
  const userLeft =
    prev.status === "signedIn" &&
    (next.status !== "signedIn" || next.userId !== prev.userId);
  return { next, clearCache: userLeft };
}
