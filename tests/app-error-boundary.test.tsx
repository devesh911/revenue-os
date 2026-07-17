// task-22 "app-level React error boundary" — RED spec. Completes the boot-honesty arc:
// #49 missing-env (ConfigErrorScreen) → #53 import-throw → THIS = render-throw. A CLASS error
// boundary wraps <App /> in main.tsx so a render-time throw anywhere in the App subtree shows an
// honest "Something went wrong / Reload the page" card instead of a blank white page.
//
// ── CRITICAL TESTING NUANCE (probed empirically against this worktree's react@19.2.7) ─────────────
// React error boundaries are a CLIENT-render feature. The synchronous SSR renderers
// (renderToStaticMarkup / renderToString) do NOT invoke getDerivedStateFromError/componentDidCatch —
// they RETHROW a child's render-time error. Probe result (throwaway, JOB_DIR/tmp):
//   renderToStaticMarkup(<AppErrorBoundary><Boom/></AppErrorBoundary>) -> RETHREW "boom during render"
//   renderToString(<AppErrorBoundary><Boom/></AppErrorBoundary>)       -> RETHREW "boom during render"
//   (instance with hasError=true).render() via renderToStaticMarkup    -> RENDERED "<div>Something went wrong</div>"
//   AppErrorBoundary.getDerivedStateFromError(new Error("x"))          -> { hasError: true }
// So AC-2 CANNOT be a literal renderToStaticMarkup(<AppErrorBoundary><Boom/></AppErrorBoundary>) test
// without a DOM, and the brief forbids adding jsdom. Highest env-free fidelity: COMPOSE the two halves
// React itself uses on a child throw — derive the error state via getDerivedStateFromError (AC-4),
// apply it to an instance, then render the boundary in that state and assert the fallback markup
// (AC-2). The true client-DOM catch (a real render throw → React swaps in the fallback) is CI/e2e-owned.
//
// Env-free by construction (imitates tests/transcript-xss.test.tsx + tests/console-boot-honesty.test.tsx:
// bun test + renderToStaticMarkup, no DOM library, no DB/network). The module-under-test is imported
// per-test so each unmet AC fails module-not-found on its own line until the worker lands the file.
import { describe, expect, it } from "bun:test";
import { Component, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const IMPORT = "../apps/console/src/app/AppErrorBoundary";

// A minimal structural view of the boundary — enough to construct it, flip its state, and render,
// without importing an implementation. `state` is intentionally mutable here (React's real state is
// Readonly) so the test can apply the derived error state the way React would.
type ErrorBoundaryCtor = {
  new (props: {
    children?: ReactNode;
  }): {
    state: { hasError?: boolean };
    render(): ReactNode;
  };
  getDerivedStateFromError(error: unknown): { hasError?: boolean };
  prototype: { componentDidCatch?: unknown };
};

// strip tags → visible text, so copy assertions never match class names / attributes.
const visible = (html: string) => html.replace(/<[^>]*>/g, "");
// a child that throws DURING render — the exact hazard the boundary must contain.
function Boom(): ReactNode {
  throw new Error("kaboom during render");
}

describe("task-22 app-level React error boundary", () => {
  // AC-1 — AppErrorBoundary is a CLASS component (error boundaries must be) with the two members
  // React requires of a boundary: static getDerivedStateFromError + instance componentDidCatch.
  it("AC-1: AppErrorBoundary is a class boundary with static getDerivedStateFromError + componentDidCatch", async () => {
    const { AppErrorBoundary } = (await import(IMPORT)) as {
      AppErrorBoundary: ErrorBoundaryCtor;
    };
    expect(typeof AppErrorBoundary).toBe("function"); // a class is a function value…
    expect(AppErrorBoundary.prototype instanceof Component).toBe(true); // …that extends React.Component
    expect(typeof AppErrorBoundary.getDerivedStateFromError).toBe("function"); // static — required for a boundary
    expect(typeof AppErrorBoundary.prototype.componentDidCatch).toBe(
      "function",
    ); // instance — required for a boundary
  });

  // AC-2 — a child that throws during render yields the honest FALLBACK, not a thrown error and not
  // a blank page. Composed exactly as React composes it on a child throw (see file header / probe):
  // derive error state from getDerivedStateFromError, apply it, render the boundary in that state.
  it("AC-2: a child that throws during render yields the fallback (honest copy), not a throw or blank", async () => {
    const { AppErrorBoundary } = (await import(IMPORT)) as {
      AppErrorBoundary: ErrorBoundaryCtor;
    };
    const derived = AppErrorBoundary.getDerivedStateFromError(
      new Error("kaboom during render"),
    );
    const boundary = new AppErrorBoundary({ children: <Boom /> });
    boundary.state = { ...(boundary.state ?? {}), ...derived };

    const html = renderToStaticMarkup(boundary.render() as ReactElement);
    expect(html.length).toBeGreaterThan(0); // not a blank page
    expect(visible(html)).toMatch(/something went wrong/i); // the honest error copy
    expect(visible(html)).toMatch(/reload the page/i); // the reload affordance's label
    expect(html.toLowerCase()).toContain("<button"); // an interactive affordance (AC-1: "e.g. an onClick reload button")
  });

  // AC-3 — passthrough: with a non-throwing child the boundary renders `children` unchanged and the
  // fallback copy is nowhere in sight. This exercises a REAL React render of the boundary (no throw).
  it("AC-3: passthrough — renders children unchanged when nothing throws", async () => {
    const { AppErrorBoundary } = (await import(IMPORT)) as {
      AppErrorBoundary: ErrorBoundaryCtor;
    };
    const html = renderToStaticMarkup(
      <AppErrorBoundary>
        <div>hello</div>
      </AppErrorBoundary>,
    );
    expect(visible(html)).toContain("hello");
    expect(visible(html)).not.toMatch(/something went wrong/i); // fallback must NOT show on the happy path
  });

  // AC-4 — pure unit, independent of rendering: getDerivedStateFromError flips the boundary to its
  // error view. toMatchObject (not toEqual) so an impl may also capture the error alongside hasError.
  it("AC-4: getDerivedStateFromError(error) returns an error-view state ({ hasError: true })", async () => {
    const { AppErrorBoundary } = (await import(IMPORT)) as {
      AppErrorBoundary: ErrorBoundaryCtor;
    };
    const state = AppErrorBoundary.getDerivedStateFromError(new Error("x"));
    expect(state).toMatchObject({ hasError: true });
  });

  // AC-5 — wired at boot (source assertion): main.tsx imports AppErrorBoundary and renders <App />
  // INSIDE it, so a render-time throw anywhere in App shows the fallback, not a white screen. The
  // parseConsoleEnv → ConfigErrorScreen gate stays (ConfigErrorScreen need NOT be inside the boundary —
  // it is already crash-safe). The createRoot mount + real client catch are CI/e2e-owned.
  it("AC-5: main.tsx wraps <App /> in AppErrorBoundary and keeps the parseConsoleEnv → ConfigErrorScreen gate", async () => {
    const src = await Bun.file("apps/console/src/main.tsx").text();
    expect(src).toMatch(
      /import\s+\{[^}]*\bAppErrorBoundary\b[^}]*\}\s+from\s+["']\.\/app\/AppErrorBoundary["']/,
    ); // imports the boundary from its own module
    expect(src).toMatch(
      /<AppErrorBoundary[^>]*>[\s\S]*<App\b[\s\S]*<\/AppErrorBoundary>/,
    ); // <App /> is nested INSIDE the boundary
    expect(src).toContain("parseConsoleEnv"); // env gate preserved
    expect(src).toContain("ConfigErrorScreen");
  });
});
