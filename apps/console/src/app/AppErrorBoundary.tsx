// App-level React error boundary (task-22) — the render-throw guard that completes the boot-honesty
// arc: task-16 missing-env (ConfigErrorScreen) → task-21 import-throw safety → THIS render-throw. A
// render-time throw anywhere in the <App /> subtree is caught here and shown as an honest reload card
// instead of a blank white page. Error boundaries are the one React feature that MUST be a class —
// static getDerivedStateFromError + componentDidCatch have no hooks equivalent. The fallback mirrors
// ConfigErrorScreen's card chrome and is pure/presentational: no env access, no data, no side effects.
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(_error: unknown): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Minimal handler: surface the render error locally. No external logging (hard rails).
    console.error("AppErrorBoundary caught a render error", error, info);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-8">
        <div className="w-full max-w-lg rounded-card border border-line bg-surface p-7 shadow-card">
          <h1 className="text-h2 text-ink">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted">
            The console hit an unexpected error and couldn't finish rendering.
            Reloading the page usually clears it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex h-10 items-center justify-center rounded-pill bg-ink px-5 text-sm font-medium text-surface transition-colors hover:bg-ink-soft"
          >
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}
