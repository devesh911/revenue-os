// The ONLY words a failed sign-in may show: fixed copy keyed on the auth error's code,
// status and name. The provider's raw message never reaches the screen — it can leak whether an
// account exists. Duck-typed: no runtime import from @supabase/supabase-js outside lib/supabase.ts.
export function signInErrorMessage(err: unknown): string {
  const { name, status, code } = (
    typeof err === "object" && err !== null ? err : {}
  ) as { name?: unknown; status?: unknown; code?: unknown };
  if (code === "invalid_credentials") return "Email or password is incorrect.";
  if (code === "email_not_confirmed")
    return "Confirm your email address, then sign in.";
  if (code === "over_request_rate_limit" || status === 429)
    return "Too many attempts. Wait a minute and try again.";
  if (name === "AuthRetryableFetchError" || status === 0)
    return "Can't reach the sign-in service. Check your connection and try again.";
  return "Sign-in failed. Try again.";
}
