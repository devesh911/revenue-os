// task-28 ui-foundation-v2 · shared test helpers (not a test itself — no `.test` suffix, so the
// runner skips it). One home for the two things the primitive suites each hand-rolled: the
// strip-tags text extractor and the barrel cast. Env-free by construction.
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
