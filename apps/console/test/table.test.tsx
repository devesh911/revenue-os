// task-28 ui-foundation-v2 · A1-RED — Table suite spec (ui/primitives/Table.tsx exporting
// Table, THead, TH, Row, TD). A semantic <table> (proper thead/tbody, TH scope="col") that
// carries today's exact token classes, replacing the hand-rolled table markup + TH/TD class
// constants copy-pasted across Tasks/Contacts/Conversations (and screens/ContactsTable).
//   TH  → py-2.5 pr-4 text-label text-muted uppercase font-medium
//   TD  → py-3 pr-4 text-sm text-ink-soft
//   Row → hairline border-b border-line; last row borderless (last:border-0 OR tbody styling —
//         asserted as a present mechanism, not an exact utility; true pixels are e2e-owned).
//
// Composition contract encoded here (chosen from the export list + the goal of removing the
// copy-paste): THead OWNS the header <tr> — it renders <thead><tr class="border-b border-line">
// {children}</tr></thead>, so a consumer nests <TH>s directly (the header keeps its hairline and
// must NOT inherit Row's last:border-0, which would erase it). Body rows live in a plain <tbody>
// of <Row>s. Env-free by construction (bun test + renderToStaticMarkup) — imitates ui-smoke.
//
// RED shape: the suite is not yet exported from ui/primitives, so each case GUARDS on
// `typeof … === "function"` first — a clean assertion failure today (not an import/typo error).
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import * as primitives from "../src/ui/primitives";
import { asPrimitivesMap, visible } from "./test-utils";

const TH_CLASSES = [
  "py-2.5",
  "pr-4",
  "text-label",
  "text-muted",
  "uppercase",
  "font-medium",
];
const TD_CLASSES = ["py-3", "pr-4", "text-sm", "text-ink-soft"];

// Undefined until the worker adds the suite; each test guards typeof === "function".
const P = asPrimitivesMap(primitives);

describe("Table suite — semantic structure + token classes", () => {
  it("Table renders a semantic <table> (full-width, left-aligned like today's pages)", () => {
    const Table = P.Table;
    expect(typeof Table).toBe("function");
    const html = renderToStaticMarkup(
      <Table>
        <tbody />
      </Table>,
    );
    expect(html).toContain("<table");
    expect(html).toContain("w-full");
    expect(html).toContain("text-left");
  });

  it("THead renders <thead> wrapping a header <tr> for its <TH> children", () => {
    const THead = P.THead;
    const TH = P.TH;
    expect(typeof THead).toBe("function");
    expect(typeof TH).toBe("function");
    const html = renderToStaticMarkup(
      <THead>
        <TH>Title</TH>
        <TH>Kind</TH>
      </THead>,
    );
    expect(html).toContain("<thead");
    expect(html).toMatch(/<thead[^>]*>\s*<tr\b/); // THead owns the header row
    expect(html).toContain("<th"); // TH children land inside
    expect(html).toContain("Title");
    expect(html).toContain("Kind");
  });

  it('TH is a <th scope="col"> carrying every TH token class', () => {
    const TH = P.TH;
    expect(typeof TH).toBe("function");
    const html = renderToStaticMarkup(<TH>Status</TH>);
    expect(html).toContain("<th");
    expect(html).toMatch(/<th[^>]*scope="col"/);
    for (const cls of TH_CLASSES) expect(html).toContain(cls);
    expect(html).toContain("Status");
  });

  it("TD is a <td> carrying every TD token class", () => {
    const TD = P.TD;
    expect(typeof TD).toBe("function");
    const html = renderToStaticMarkup(<TD>cell value</TD>);
    expect(html).toContain("<td");
    for (const cls of TD_CLASSES) expect(html).toContain(cls);
    expect(html).toContain("cell value");
  });

  it("Row is a <tr> with the hairline border (border-b border-line)", () => {
    const Row = P.Row;
    const TD = P.TD;
    expect(typeof Row).toBe("function");
    expect(typeof TD).toBe("function");
    const html = renderToStaticMarkup(
      <Row>
        <TD>x</TD>
      </Row>,
    );
    expect(html).toContain("<tr");
    expect(html).toContain("border-b");
    expect(html).toContain("border-line");
  });

  it("composes into a proper table: thead + tbody + th[scope=col] + td", () => {
    const { Table, THead, TH, Row, TD } = P;
    for (const C of [Table, THead, TH, Row, TD]) {
      expect(typeof C).toBe("function");
    }
    const html = renderToStaticMarkup(
      <Table>
        <THead>
          <TH>Contact</TH>
          <TH>Channel</TH>
        </THead>
        <tbody>
          <Row>
            <TD>Ada</TD>
            <TD>sms</TD>
          </Row>
          <Row>
            <TD>Grace</TD>
            <TD>voice</TD>
          </Row>
        </tbody>
      </Table>,
    );
    expect(html).toContain("<table");
    expect(html).toContain("<thead");
    expect(html).toContain("<tbody");
    expect(html).toMatch(/<th[^>]*scope="col"/);
    expect(html).toContain("<td");
    expect(visible(html)).toContain("Ada");
    expect(visible(html)).toContain("Grace");
  });

  it("last body row is borderless via a present mechanism (last:border-0 or tbody last-child)", () => {
    const { Table, THead, TH, Row, TD } = P;
    for (const C of [Table, THead, TH, Row, TD]) {
      expect(typeof C).toBe("function");
    }
    const html = renderToStaticMarkup(
      <Table>
        <THead>
          <TH>Name</TH>
        </THead>
        <tbody>
          <Row>
            <TD>one</TD>
          </Row>
          <Row>
            <TD>two</TD>
          </Row>
        </tbody>
      </Table>,
    );
    // structural signal only — the true "no bottom hairline on the last row" is CSS, e2e-owned.
    expect(html).toMatch(/last:border-0|last-child/);
  });

  it("uses tokens only — no raw hex and no gray-*/slate-*/blue-* palette classes", () => {
    const { Table, THead, TH, Row, TD } = P;
    for (const C of [Table, THead, TH, Row, TD]) {
      expect(typeof C).toBe("function");
    }
    const html = renderToStaticMarkup(
      <Table>
        <THead>
          <TH>Col</TH>
        </THead>
        <tbody>
          <Row>
            <TD>v</TD>
          </Row>
        </tbody>
      </Table>,
    );
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/); // no raw hex colors
    expect(html).not.toMatch(
      /\b(?:gray|slate|zinc|neutral|blue|red|green|yellow|indigo)-\d{2,3}\b/,
    );
  });
});
