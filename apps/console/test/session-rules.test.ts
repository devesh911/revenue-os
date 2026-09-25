// Console sign-in front door — RED spec for the three pure session rules the sign-in flow stands on:
//   safeNext            where to send someone after sign-in: only a same-site path, never
//                       another site (an open redirect) and never back to /login itself;
//   signInErrorMessage  the ONLY words a failed sign-in may show — fixed, friendly copy;
//                       the provider's raw message (which can leak account details) never appears;
//   reduceAuth          the session state machine fed by Supabase auth events, including
//                       WHEN the query cache must be wiped so one user never sees another's data.
// Pure functions, env-free; each module loads per test so a missing file fails only its own cases.
import { describe, expect, it } from "bun:test";

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; userId: string; email: string | null };
type Session = { user: { id: string; email?: string | null } } | null;
type ReduceAuth = (
  prev: AuthState,
  event: string,
  session: Session,
) => { next: AuthState; clearCache: boolean };

const loadSafeNext = async () =>
  (
    (await import("../src/app/session/safe-next")) as {
      safeNext: (raw: string | null | undefined) => string;
    }
  ).safeNext;

const loadSignInErrorMessage = async () =>
  (
    (await import("../src/app/session/sign-in-errors")) as {
      signInErrorMessage: (err: unknown) => string;
    }
  ).signInErrorMessage;

const loadReduceAuth = async () =>
  (
    (await import("../src/app/session/auth-state")) as {
      reduceAuth: ReduceAuth;
    }
  ).reduceAuth;

// An auth error shaped like supabase-js's (name/status/code/message). Duck-typed on purpose: the
// console may import no runtime value from @supabase/supabase-js outside lib/supabase.ts.
const authError = (fields: {
  name: string;
  status?: number;
  code?: string;
  message: string;
}): Error => Object.assign(new Error(fields.message), fields);

const COPY = {
  wrong: "Email or password is incorrect.",
  unconfirmed: "Confirm your email address, then sign in.",
  rateLimited: "Too many attempts. Wait a minute and try again.",
  offline:
    "Can't reach the sign-in service. Check your connection and try again.",
  generic: "Sign-in failed. Try again.",
};

describe("safeNext — post-sign-in destination", () => {
  // Same-site paths (with query and hash) pass through untouched.
  it("accepts same-site paths, keeping their query and hash", async () => {
    const safeNext = await loadSafeNext();
    expect(safeNext("/o/x/home")).toBe("/o/x/home");
    expect(safeNext("/o/x/home?y=1#z")).toBe("/o/x/home?y=1#z");
  });

  // Off-site, script, empty and login-loop destinations all fall back to "/".
  it("returns '/' for off-site, script, empty and /login destinations", async () => {
    const safeNext = await loadSafeNext();
    const hostile: Array<string | null | undefined> = [
      "//evil.com", // protocol-relative → another site
      "/\\evil.com", // browsers treat "\" as "/" → //evil.com
      "https://evil.com",
      "javascript:alert(1)",
      "",
      null,
      undefined,
      "/login", // would loop back to the sign-in page
      "/login?next=%2Fo",
    ];
    for (const raw of hostile) expect(safeNext(raw)).toBe("/");
  });

  // Hardening — whitespace the URL parser silently strips must not smuggle in "//evil.com".
  it("returns '/' when stripped whitespace would turn the path into //evil.com", async () => {
    const safeNext = await loadSafeNext();
    for (const raw of ["/\t/evil.com", "/\n/evil.com", " //evil.com"])
      expect(safeNext(raw)).toBe("/");
  });
});

describe("signInErrorMessage — fixed copy, never the raw error", () => {
  // Wrong email/password.
  it("invalid_credentials → 'Email or password is incorrect.'", async () => {
    const signInErrorMessage = await loadSignInErrorMessage();
    const err = authError({
      name: "AuthApiError",
      status: 400,
      code: "invalid_credentials",
      message: "Invalid login credentials",
    });
    expect(signInErrorMessage(err)).toBe(COPY.wrong);
  });

  // Account exists but the email address was never confirmed.
  it("email_not_confirmed → 'Confirm your email address, then sign in.'", async () => {
    const signInErrorMessage = await loadSignInErrorMessage();
    const err = authError({
      name: "AuthApiError",
      status: 400,
      code: "email_not_confirmed",
      message: "Email not confirmed",
    });
    expect(signInErrorMessage(err)).toBe(COPY.unconfirmed);
  });

  // Rate limited, by code or by HTTP 429 alone.
  it("over_request_rate_limit or status 429 → 'Too many attempts…'", async () => {
    const signInErrorMessage = await loadSignInErrorMessage();
    const byCode = authError({
      name: "AuthApiError",
      status: 429,
      code: "over_request_rate_limit",
      message: "Request rate limit reached",
    });
    const byStatus = authError({
      name: "AuthApiError",
      status: 429,
      message: "Too Many Requests",
    });
    expect(signInErrorMessage(byCode)).toBe(COPY.rateLimited);
    expect(signInErrorMessage(byStatus)).toBe(COPY.rateLimited);
  });

  // The sign-in service can't be reached (retryable fetch error, or status 0).
  it("AuthRetryableFetchError or status 0 → 'Can't reach the sign-in service…'", async () => {
    const signInErrorMessage = await loadSignInErrorMessage();
    const retryable = authError({
      name: "AuthRetryableFetchError",
      status: 0,
      message: "Failed to fetch",
    });
    const retryableGateway = authError({
      name: "AuthRetryableFetchError",
      status: 502,
      message: "Bad Gateway",
    });
    const statusZero = authError({
      name: "AuthUnknownError",
      status: 0,
      message: "network down",
    });
    expect(signInErrorMessage(retryable)).toBe(COPY.offline);
    expect(signInErrorMessage(retryableGateway)).toBe(COPY.offline);
    expect(signInErrorMessage(statusZero)).toBe(COPY.offline);
  });

  // Everything else gets the generic line, and no raw provider message ever leaks.
  it("anything else → 'Sign-in failed. Try again.' and the raw message never leaks", async () => {
    const signInErrorMessage = await loadSignInErrorMessage();
    const secret = "User not found: secret-detail";
    const others: unknown[] = [
      authError({
        name: "AuthApiError",
        status: 500,
        code: "unexpected_failure",
        message: secret,
      }),
      authError({
        name: "AuthApiError",
        status: 422,
        code: "user_banned",
        message: secret,
      }),
      new Error(secret),
      secret,
      { message: secret },
      null,
      undefined,
    ];
    for (const err of others) {
      const shown = signInErrorMessage(err);
      expect(shown).toBe(COPY.generic);
      expect(shown).not.toContain("secret-detail");
    }
  });
});

describe("reduceAuth — session state + cache-wipe rule", () => {
  const u1 = { user: { id: "u-1", email: "one@local.test" } };
  const u2 = { user: { id: "u-2", email: "two@local.test" } };
  const signedInU1: AuthState = {
    status: "signedIn",
    userId: "u-1",
    email: "one@local.test",
  };

  // The first session (page load or fresh sign-in) signs in without wiping anything.
  it("INITIAL_SESSION / SIGNED_IN with a session from loading → signedIn, clearCache false", async () => {
    const reduceAuth = await loadReduceAuth();
    for (const event of ["INITIAL_SESSION", "SIGNED_IN"]) {
      expect(reduceAuth({ status: "loading" }, event, u1)).toEqual({
        next: signedInU1,
        clearCache: false,
      });
    }
    // a user with no email still signs in; email is null, not undefined
    expect(
      reduceAuth({ status: "loading" }, "SIGNED_IN", { user: { id: "u-3" } }),
    ).toEqual({
      next: { status: "signedIn", userId: "u-3", email: null },
      clearCache: false,
    });
  });

  // Signing out wipes the cache so the next person on this browser starts clean.
  it("SIGNED_OUT → signedOut with clearCache true", async () => {
    const reduceAuth = await loadReduceAuth();
    expect(reduceAuth(signedInU1, "SIGNED_OUT", null)).toEqual({
      next: { status: "signedOut" },
      clearCache: true,
    });
  });

  // A DIFFERENT user signing in over an existing session also wipes the cache.
  it("SIGNED_IN as a different user than the current one → clearCache true", async () => {
    const reduceAuth = await loadReduceAuth();
    expect(reduceAuth(signedInU1, "SIGNED_IN", u2)).toEqual({
      next: { status: "signedIn", userId: "u-2", email: "two@local.test" },
      clearCache: true,
    });
  });

  // Token refreshes and profile updates for the SAME user keep the cache.
  it("TOKEN_REFRESHED / USER_UPDATED for the same user → clearCache false", async () => {
    const reduceAuth = await loadReduceAuth();
    for (const event of ["TOKEN_REFRESHED", "USER_UPDATED"]) {
      const { next, clearCache } = reduceAuth(signedInU1, event, u1);
      expect(next).toEqual(signedInU1);
      expect(clearCache).toBe(false);
    }
  });

  // No stored session on page load → signed out, nothing to wipe.
  it("INITIAL_SESSION with a null session → signedOut, clearCache false", async () => {
    const reduceAuth = await loadReduceAuth();
    expect(reduceAuth({ status: "loading" }, "INITIAL_SESSION", null)).toEqual({
      next: { status: "signedOut" },
      clearCache: false,
    });
  });
});
