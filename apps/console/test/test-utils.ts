// Shared test helpers (not a test itself — no `.test` suffix, so the
// runner skips it). One home for what the suites each hand-rolled: the strip-tags text extractor,
// the barrel cast, and the leak-proof module mock — plus the sign-in suites' decoded-text, button
// and real-ApiError helpers. Env-free by construction.
import { mock } from "bun:test";
import { apiFetch } from "@revenue-os/shared";
import type { ComponentType } from "react";
import { z } from "zod";

// tags stripped → visible text only, so text assertions never match class names / attributes.
export const visible = (html: string): string => html.replace(/<[^>]*>/g, "");

// visible() with React's SSR entity escapes decoded, so copy like "You're …" / "Can't …" can be
// asserted verbatim (renderToStaticMarkup writes ' as &#x27;).
export const text = (html: string): string =>
  visible(html)
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

// Visible labels of every <button> in the markup, in order.
export const buttons = (html: string): string[] =>
  [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) =>
    text(m[1] ?? "").trim(),
  );

// The error the shared apiFetch throws for an HTTP `status` (0 = the fetch itself rejected, i.e. a
// network failure). Produced THROUGH apiFetch so the tests never guess ApiError's constructor.
export async function apiErrorFor(status: number): Promise<unknown> {
  const fetchImpl = (async () => {
    if (status === 0) throw new TypeError("Failed to fetch");
    return new Response("{}", { status });
  }) as unknown as typeof fetch;
  return apiFetch("http://api.invalid.test", "/orgs", z.unknown(), {
    fetchImpl,
  }).then(
    () => {
      throw new Error(`apiFetch resolved for HTTP ${status}; expected a throw`);
    },
    (error: unknown) => error,
  );
}

// The primitives barrel viewed as a name → component lookup. Entries are undefined until a
// primitive is actually exported, so RED cases can guard on `typeof … === "function"`.
export type PrimitivesMap = Record<
  string,
  ComponentType<Record<string, unknown>> | undefined
>;

// The single home for the `import * as primitives` → lookup cast the suites share.
export const asPrimitivesMap = (barrel: unknown): PrimitivesMap =>
  barrel as PrimitivesMap;

// Bun's mock.module is process-global and mock.restore() does NOT undo it (Bun 1.3): a file's fakes,
// or a bare factory's MISSING exports, leak into every file the runner happens to load next, so the
// suite passes or fails by file order (CI's Linux order broke on a dropped useTasksQuery). mockModule
// lays the fakes over a snapshot of the real exports and returns the restore, which re-mocks the path
// back to that snapshot: call it in afterAll. Relative paths resolve from this directory, i.e. exactly
// as they do from the console test files beside it.
export function mockModule(
  path: string,
  real: object,
  fakes: Record<string, unknown>,
): () => void {
  const snapshot = { ...real };
  mock.module(path, () => ({ ...snapshot, ...fakes }));
  return () => {
    mock.module(path, () => snapshot);
  };
}
