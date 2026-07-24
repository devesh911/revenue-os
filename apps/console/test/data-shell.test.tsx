// task-28 ui-foundation-v2 · A1-RED — DataShell primitive spec (ui/primitives/DataShell.tsx).
// DataShell standardizes the loading/error/empty/content branch copy-pasted across 6 pages
// (Tasks/Contacts/Conversations/Dashboard/Home/Settings). Props: isLoading, isError, isEmpty?,
// loadingText? (default "Loading…"), errorText? (default "Unable to load data."), emptyText?,
// children. Each non-happy state renders as <p className="text-sm text-muted"> exactly like
// today's pages (calm, factual); children render ONLY on the happy path.
//
// Env-free by construction (bun test + renderToStaticMarkup, no DOM library, no DB/network,
// no new deps) — imitates apps/console/test/ui-smoke.test.tsx.
//
// RED shape: DataShell is not yet exported from ui/primitives, so every behavioral case GUARDS
// on `typeof DataShell === "function"` first. Today that assertion fails cleanly (expected
// "undefined" to be "function" — an assertion, NOT an import/typo error). Once the worker lands
// the component the guard passes and the assertions below it run as the real behavioral spec.
import { describe, expect, it } from "bun:test";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as primitives from "../src/ui/primitives";

// tags stripped → visible text only, so text assertions never match class names / attributes.
const visible = (html: string) => html.replace(/<[^>]*>/g, "");
// unique marker for the happy-path children — must be ABSENT in every non-happy state.
const ROWS = "data-shell-children-marker";
const children = <div>{ROWS}</div>;

// Undefined until the worker adds the primitive; each test guards typeof === "function".
const P = primitives as unknown as Record<
  string,
  ComponentType<Record<string, unknown>> | undefined
>;

describe("DataShell — loading / error / empty / content branches", () => {
  it("loading: default 'Loading…' in a muted <p>, children hidden", () => {
    const DataShell = P.DataShell;
    expect(typeof DataShell).toBe("function");
    const html = renderToStaticMarkup(
      <DataShell isLoading isError={false}>
        {children}
      </DataShell>,
    );
    expect(html.startsWith("<p")).toBe(true); // state = a bare <p>, nothing else
    expect(html).toContain("text-sm");
    expect(html).toContain("text-muted");
    expect(visible(html)).toContain("Loading…"); // default loadingText
    expect(html).not.toContain(ROWS); // children hidden while loading
  });

  it("error: default 'Unable to load data.' in a muted <p>, children hidden", () => {
    const DataShell = P.DataShell;
    expect(typeof DataShell).toBe("function");
    const html = renderToStaticMarkup(
      <DataShell isLoading={false} isError>
        {children}
      </DataShell>,
    );
    expect(html.startsWith("<p")).toBe(true);
    expect(html).toContain("text-sm");
    expect(html).toContain("text-muted");
    expect(visible(html)).toContain("Unable to load data."); // default errorText
    expect(html).not.toContain(ROWS); // children hidden on error
  });

  it("empty: renders emptyText in a muted <p>, children hidden", () => {
    const DataShell = P.DataShell;
    expect(typeof DataShell).toBe("function");
    const html = renderToStaticMarkup(
      <DataShell
        isLoading={false}
        isError={false}
        isEmpty
        emptyText="No tasks."
      >
        {children}
      </DataShell>,
    );
    expect(html.startsWith("<p")).toBe(true);
    expect(html).toContain("text-sm");
    expect(html).toContain("text-muted");
    expect(visible(html)).toContain("No tasks.");
    expect(html).not.toContain(ROWS); // children hidden on empty
  });

  it("happy path (all flags false, isEmpty omitted): renders children, no state copy", () => {
    const DataShell = P.DataShell;
    expect(typeof DataShell).toBe("function");
    const html = renderToStaticMarkup(
      <DataShell isLoading={false} isError={false}>
        {children}
      </DataShell>,
    );
    expect(html).toContain(ROWS); // children shown
    const text = visible(html);
    expect(text).not.toContain("Loading…");
    expect(text).not.toContain("Unable to load data.");
  });

  it("custom loadingText is respected (default not rendered)", () => {
    const DataShell = P.DataShell;
    expect(typeof DataShell).toBe("function");
    const html = renderToStaticMarkup(
      <DataShell isLoading isError={false} loadingText="Fetching orgs…">
        {children}
      </DataShell>,
    );
    expect(visible(html)).toContain("Fetching orgs…");
    expect(visible(html)).not.toContain("Loading…");
  });

  it("custom errorText is respected (default not rendered)", () => {
    const DataShell = P.DataShell;
    expect(typeof DataShell).toBe("function");
    const html = renderToStaticMarkup(
      <DataShell isLoading={false} isError errorText="Transcript unavailable.">
        {children}
      </DataShell>,
    );
    expect(visible(html)).toContain("Transcript unavailable.");
    expect(visible(html)).not.toContain("Unable to load data.");
  });

  it("defaults are exact: 'Loading…' and 'Unable to load data.'", () => {
    const DataShell = P.DataShell;
    expect(typeof DataShell).toBe("function");
    const loading = renderToStaticMarkup(
      <DataShell isLoading isError={false} />,
    );
    const error = renderToStaticMarkup(<DataShell isLoading={false} isError />);
    expect(visible(loading)).toBe("Loading…");
    expect(visible(error)).toBe("Unable to load data.");
  });

  it("precedence: loading wins over error", () => {
    const DataShell = P.DataShell;
    expect(typeof DataShell).toBe("function");
    const html = renderToStaticMarkup(
      <DataShell
        isLoading
        isError
        loadingText="LOADING_WINS"
        errorText="ERROR_LOSES"
      />,
    );
    expect(visible(html)).toContain("LOADING_WINS");
    expect(visible(html)).not.toContain("ERROR_LOSES");
  });

  it("precedence: error wins over empty", () => {
    const DataShell = P.DataShell;
    expect(typeof DataShell).toBe("function");
    const html = renderToStaticMarkup(
      <DataShell
        isLoading={false}
        isError
        isEmpty
        errorText="ERROR_WINS"
        emptyText="EMPTY_LOSES"
      />,
    );
    expect(visible(html)).toContain("ERROR_WINS");
    expect(visible(html)).not.toContain("EMPTY_LOSES");
  });
});
