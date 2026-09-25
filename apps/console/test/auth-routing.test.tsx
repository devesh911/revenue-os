// Console sign-in front door — RED spec for sign-in routing (AC-C1). The router serves the public
// /login page OUTSIDE the session gate and every other page INSIDE it:
//   - a signed-out visitor is sent to /login, carrying where they were going as `next`;
//   - a signed-in visitor on /login is sent on to `next` — but only a safe, same-site one;
//   - while the session is still loading, neither the form nor any protected page renders.
// Env-free SSR, no DOM: wouter 3.10's <Router ssrPath ssrSearch ssrContext> pins the location, and
// ssrContext.redirectTo records where a <Redirect to=…> would go (wouter records `to` only — see
// node_modules/wouter/src/index.js, Redirect). The session comes from SessionProvider's test-only
// `initialState`, so no effect or Supabase call is needed; a fake client is passed anyway so
// nothing can reach for a real one. Modules load per test.
import { describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentType, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router as WouterRouter } from "wouter";
import { text } from "./test-utils";

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; userId: string; email: string | null };

type SessionProviderProps = {
  client?: unknown;
  queryClient: QueryClient;
  initialState?: AuthState;
  children: ReactNode;
};

const LOADING: AuthState = { status: "loading" };
const SIGNED_OUT: AuthState = { status: "signedOut" };
const SIGNED_IN: AuthState = {
  status: "signedIn",
  userId: "u-1",
  email: "dev@local.test",
};

const HEADING = "Sign in to Revenue OS";
// Protected chrome: the AppShell sidebar's nav labels and the topbar's sign-out button.
const PROTECTED = ["Analytics", "Settings", "Sign out"];

const noop = () => {};
// Just enough of a Supabase client for a provider that (correctly) only touches it in effects.
const fakeClient = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({
      data: { subscription: { unsubscribe: noop } },
    }),
    signInWithPassword: async () => ({
      data: { session: null, user: null },
      error: null,
    }),
    signOut: async () => ({ error: null }),
  },
};

async function renderAt(
  url: string,
  initialState: AuthState,
): Promise<{ text: string; redirectTo: string | undefined }> {
  const { SessionProvider } = (await import(
    "../src/app/session/SessionProvider"
  )) as { SessionProvider: ComponentType<SessionProviderProps> };
  const { Router } = await import("../src/app/router");
  const [ssrPath = "/", ssrSearch = ""] = url.split("?");
  const ssrContext: { redirectTo?: string } = {};
  const queryClient = new QueryClient();
  const html = renderToStaticMarkup(
    <WouterRouter
      ssrPath={ssrPath}
      ssrSearch={ssrSearch}
      ssrContext={ssrContext}
    >
      <QueryClientProvider client={queryClient}>
        <SessionProvider
          client={fakeClient}
          queryClient={queryClient}
          initialState={initialState}
        >
          <Router />
        </SessionProvider>
      </QueryClientProvider>
    </WouterRouter>,
  );
  queryClient.clear();
  return { text: text(html), redirectTo: ssrContext.redirectTo };
}

const expectNoProtectedContent = (visibleText: string) => {
  for (const marker of PROTECTED) expect(visibleText).not.toContain(marker);
};

describe("sign-in routing (AC-C1)", () => {
  // AC-C1 — signed out on a protected page → /login with the full original location as `next`.
  it("AC-C1: signed out at /o/abc/home?tab=x → redirect to /login?next=%2Fo%2Fabc%2Fhome%3Ftab%3Dx", async () => {
    const out = await renderAt("/o/abc/home?tab=x", SIGNED_OUT);
    expect(out.redirectTo).toBe("/login?next=%2Fo%2Fabc%2Fhome%3Ftab%3Dx");
    expectNoProtectedContent(out.text);
  });

  // AC-C1 — signed out on /login → the sign-in form renders, no redirect.
  it("AC-C1: signed out at /login → renders the sign-in form", async () => {
    const out = await renderAt("/login", SIGNED_OUT);
    expect(out.redirectTo).toBeUndefined();
    expect(out.text).toContain(HEADING);
    expectNoProtectedContent(out.text);
  });

  // AC-C1 — signed in on /login with a same-site `next` → sent on to it.
  it("AC-C1: signed in at /login?next=%2Fo%2Fabc%2Fcontacts → redirect to /o/abc/contacts", async () => {
    const out = await renderAt("/login?next=%2Fo%2Fabc%2Fcontacts", SIGNED_IN);
    expect(out.redirectTo).toBe("/o/abc/contacts");
    expect(out.text).not.toContain(HEADING);
  });

  // AC-C1 — signed in on /login with an off-site `next` (or none) → sent to "/", never off-site.
  it("AC-C1: signed in at /login?next=%2F%2Fevil.com → redirect to / (and no next → /)", async () => {
    const evil = await renderAt("/login?next=%2F%2Fevil.com", SIGNED_IN);
    expect(evil.redirectTo).toBe("/");
    expect(evil.text).not.toContain(HEADING);
    const bare = await renderAt("/login", SIGNED_IN);
    expect(bare.redirectTo).toBe("/");
  });

  // AC-C1 — session still loading → neither the form nor protected content, and no redirect yet.
  it("AC-C1: loading renders neither the sign-in form nor protected content (on /login or a protected page)", async () => {
    for (const url of ["/o/abc/home", "/login"]) {
      const out = await renderAt(url, LOADING);
      expect(out.redirectTo).toBeUndefined();
      expect(out.text).not.toContain(HEADING);
      expectNoProtectedContent(out.text);
    }
  });
});
