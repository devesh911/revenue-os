// Transcripts render as text (docs/security.md S7.1): a caller can literally say "<script>" and it must show as
// inert text, never run or draw as markup. That no console code injects raw HTML at all is a guard
// (scripts/guards/raw-html.sh; scripts/guards-sdk-raw-html.test.ts proves it fires).
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  type TranscriptMessage,
  TranscriptView,
} from "../src/features/conversations/TranscriptView";

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
  { seq: 4, role: "tool", content: null, ts: null }, // content is nullable in the database
];

describe("transcripts render hostile content as text", () => {
  // behaviour already on main: moved from tests/transcript-xss.test.tsx unchanged in what it checks
  it("renders hostile transcript content as inert text, never markup", () => {
    const html = renderToStaticMarkup(<TranscriptView messages={hostile} />);

    // the payloads survive as escaped TEXT…
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");

    // …and never as executable/renderable markup: no element tag survives, and no TAG CONTEXT
    // carries a handler or javascript: URI. (Escaped TEXT legitimately contains substrings like
    // `onerror=`, so asserting on raw substrings would be wrong.)
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
});
