// S7.1 — transcripts render as text nodes: callers can literally speak "<script>" and it
// must die as inert text. Render half: hostile content comes out escaped, never as markup.
// Static half: dangerouslySetInnerHTML must not exist anywhere in console src.
// (spec §12b: "S7.1 XSS-transcript render test in CI"; runs in CI's plain `bun test`.)
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  type TranscriptMessage,
  TranscriptView,
} from "../apps/console/src/features/conversations/TranscriptView";

const hostile: TranscriptMessage[] = [
  { seq: 1, role: "contact", content: "<script>alert(1)</script>", ts: null },
  {
    seq: 2,
    role: "agent",
    content: '<img src=x onerror="alert(1)">',
    ts: "2026-07-11T05:00:00Z",
  },
  {
    seq: 3,
    role: "human_agent",
    content: '</p><a href="javascript:alert(1)">click</a>',
    ts: null,
  },
  { seq: 4, role: "tool", content: null, ts: null }, // content is nullable in the DDL
];

describe("S7.1 transcript XSS hardening", () => {
  it("renders hostile transcript content as inert text, never markup", () => {
    const html = renderToStaticMarkup(<TranscriptView messages={hostile} />);

    // the payloads survive as escaped TEXT…
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");

    // …and never as executable/renderable markup: no element tag survives, and no TAG CONTEXT
    // carries a handler or javascript: URI. (Escaped TEXT legitimately contains substrings like
    // `onerror=` — asserting on raw substrings was this spec's original bug.)
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toMatch(/<[^>]*\bonerror\s*=/i);
    expect(html).not.toMatch(/href\s*=\s*["']?javascript:/i);

    // content must round-trip VERBATIM: still readable as text, and never rewritten by a
    // "sanitizer" (no invisible characters injected — transcripts are evidence-grade data)
    expect(html).toContain("onerror=");
    expect(html).not.toContain("\u200b"); // no zero-width "sanitizer" injections
  });

  it("renders a null-content message without crashing and without fabricating markup", () => {
    const html = renderToStaticMarkup(
      <TranscriptView
        messages={[{ seq: 1, role: "tool", content: null, ts: null }]}
      />,
    );
    expect(html.length).toBeGreaterThan(0);
  });

  it("no dangerouslySetInnerHTML anywhere in console src (static sweep)", async () => {
    const glob = new Bun.Glob("apps/console/src/**/*.{ts,tsx}");
    let checked = 0;
    for await (const path of glob.scan(".")) {
      const src = await Bun.file(path).text();
      expect(src).not.toContain("dangerouslySetInnerHTML");
      checked++;
    }
    expect(checked).toBeGreaterThan(5); // the sweep must actually have swept
  });
});
