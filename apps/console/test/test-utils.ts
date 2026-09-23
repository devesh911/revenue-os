// task-28 ui-foundation-v2 · shared test helpers (not a test itself — no `.test` suffix, so the
// runner skips it). One home for what the suites each hand-rolled: the strip-tags text extractor,
// the barrel cast, and the leak-proof module mock. Env-free by construction.
import { mock } from "bun:test";
import type { ComponentType } from "react";

// tags stripped → visible text only, so text assertions never match class names / attributes.
export const visible = (html: string): string => html.replace(/<[^>]*>/g, "");

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
