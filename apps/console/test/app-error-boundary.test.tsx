// The console's error boundary (src/app/AppErrorBoundary.tsx): a screen that throws while it draws shows an honest
// "Something went wrong / Reload the page" card instead of a blank page. That the console runs the app inside it is
// boot.test.tsx.
//
// React error boundaries catch only in a browser: the server renderers used here (renderToStaticMarkup /
// renderToString) rethrow a child's error instead of calling getDerivedStateFromError. So, with no DOM library,
// these tests compose the two halves React itself uses on a child's throw: derive the error state with
// getDerivedStateFromError, apply it to an instance, then render the boundary in that state.
import { describe, expect, it } from "bun:test";
import { Component, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppErrorBoundary } from "../src/app/AppErrorBoundary";
import { visible } from "./test-utils";

// a child that throws DURING render — the exact hazard the boundary must contain.
function Boom(): ReactNode {
  throw new Error("kaboom during render");
}

describe("the console's error boundary", () => {
  // behaviour already on main: moved from tests/app-error-boundary.test.tsx unchanged in what it checks
  it("is a class boundary with static getDerivedStateFromError and componentDidCatch", () => {
    expect(AppErrorBoundary.prototype instanceof Component).toBe(true);
    expect(typeof AppErrorBoundary.getDerivedStateFromError).toBe("function");
    expect(typeof AppErrorBoundary.prototype.componentDidCatch).toBe(
      "function",
    );
  });

  // behaviour already on main: moved from tests/app-error-boundary.test.tsx unchanged in what it checks
  it("shows the fallback card, with a reload button, when a child throws while drawing", () => {
    const derived = AppErrorBoundary.getDerivedStateFromError(
      new Error("kaboom during render"),
    );
    const boundary = new AppErrorBoundary({ children: <Boom /> });
    boundary.state = { ...boundary.state, ...derived };

    const html = renderToStaticMarkup(boundary.render() as ReactElement);
    expect(visible(html)).toMatch(/something went wrong/i);
    expect(visible(html)).toMatch(/reload the page/i);
    expect(html.toLowerCase()).toContain("<button");
  });

  // behaviour already on main: moved from tests/app-error-boundary.test.tsx unchanged in what it checks
  it("renders its children unchanged when nothing throws", () => {
    const html = renderToStaticMarkup(
      <AppErrorBoundary>
        <div>hello</div>
      </AppErrorBoundary>,
    );
    expect(visible(html)).toContain("hello");
    expect(visible(html)).not.toMatch(/something went wrong/i);
  });

  // behaviour already on main: moved from tests/app-error-boundary.test.tsx unchanged in what it checks
  it("getDerivedStateFromError turns on the error view", () => {
    expect(
      AppErrorBoundary.getDerivedStateFromError(new Error("x")),
    ).toMatchObject({ hasError: true });
  });
});
