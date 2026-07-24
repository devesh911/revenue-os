// RED spec for TASK-29 — www rebuild: semantic HTML + a token-based CSS layer,
// with IDENTICAL visuals to the current single-file export. Companion to
// landing.test.ts, which pins content/behavior (AC-1/2/4) and the rebuilt font
// spec (AC-3). This file pins the TARGET ARCHITECTURE the GREEN rebuild produces:
//   • index.html carries zero inline styling and no inline <style> block;
//   • it links exactly the three stylesheets, in cascade order;
//   • every named colour / hairline / font family is a custom property in
//     tokens.css, at the EXACT value from the export ("identical visuals");
//   • components.css / page.css never carry raw colour hex or !important
//     (hex lives only in tokens.css; !important only existed to beat inline
//     desktop styles that no longer exist);
//   • the document uses semantic landmarks and exactly one <h1>;
//   • every section's load-bearing copy survives the port (parity guards).
//
// Pure string/regex + fs contract — env-free, no DOM libs, no new deps — same
// posture as landing.test.ts. Against the current single-file export the
// "target architecture" blocks (AC-5..AC-9) are RED; the "copy parity" guards
// (AC-10) are GREEN now and must stay GREEN through the rebuild.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const WWW_DIR = resolve(import.meta.dir, "..");
const INDEX_PATH = resolve(WWW_DIR, "index.html");
const STYLES_DIR = resolve(WWW_DIR, "styles");
const TOKENS_PATH = resolve(STYLES_DIR, "tokens.css");
const COMPONENTS_PATH = resolve(STYLES_DIR, "components.css");
const PAGE_PATH = resolve(STYLES_DIR, "page.css");

// Existence is asserted first so the pre-rebuild state (no styles/ dir yet) fails
// as a clear assertion — the RED reason — rather than an opaque fs throw.
function readOrFail(path: string, label: string): string {
  expect(existsSync(path), `${label} must exist: ${path}`).toBe(true);
  return readFileSync(path, "utf8");
}
const readIndex = () => readOrFail(INDEX_PATH, "apps/www/index.html");
const readTokens = () => readOrFail(TOKENS_PATH, "apps/www/styles/tokens.css");
const readComponents = () =>
  readOrFail(COMPONENTS_PATH, "apps/www/styles/components.css");
const readPage = () => readOrFail(PAGE_PATH, "apps/www/styles/page.css");

// A raw colour hex literal: '#' + exactly 3 or 6 hex digits at a word boundary.
// The section anchor ids in this site (#how #moats #pricing #faq #cta) are never
// all-hex, so this never mistakes an id selector for a colour.
const HEX_COLOR = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/;

// ── AC-5 · index.html carries no inline styling ────────────────────────────
describe("AC-5 no inline styling in index.html", () => {
  test("zero style= attributes", () => {
    const styleAttrs = readIndex().match(/\sstyle\s*=\s*["']/gi) ?? [];
    expect(styleAttrs.length).toBe(0);
  });

  test("no inline <style> block (all CSS is external)", () => {
    expect(/<style[\s>]/i.test(readIndex())).toBe(false);
  });
});

// ── AC-6 · index.html links exactly the three stylesheets, in order ────────
describe("AC-6 links exactly the three token-based stylesheets", () => {
  test("tokens.css, components.css, page.css in cascade order", () => {
    const hrefs = [
      ...readIndex().matchAll(
        /<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/gi,
      ),
    ].map((m) => {
      const h = /\bhref\s*=\s*["']([^"']+)["']/i.exec(m[0]);
      return (h?.[1] ?? "").replace(/^\.\//, "");
    });
    // Order is load-bearing: tokens first (defines the custom properties),
    // then components (base patterns), then page (composition + responsive
    // overrides). page.css beats components.css by coming last at equal
    // specificity — which is why the rebuild needs no !important.
    expect(hrefs).toEqual([
      "styles/tokens.css",
      "styles/components.css",
      "styles/page.css",
    ]);
  });
});

// ── AC-7 · tokens.css owns the palette + font families ─────────────────────
// Each named token carries the EXACT value from the export — the "identical
// visuals" contract at the token layer. Property NAMES are the rebuild's choice;
// only that a custom property (--x:) carries each exact value is pinned.
describe("AC-7 tokens.css defines the design tokens", () => {
  const COLORS: Array<[string, RegExp]> = [
    ["ground #0B1712", /--[\w-]+\s*:\s*#0B1712\b/i],
    ["cream #EDE3CF", /--[\w-]+\s*:\s*#EDE3CF\b/i],
    ["gold #E8C87A", /--[\w-]+\s*:\s*#E8C87A\b/i],
    ["intent teal #8FB8A8", /--[\w-]+\s*:\s*#8FB8A8\b/i],
  ];
  for (const [label, re] of COLORS) {
    test(`custom property for ${label}`, () => {
      expect(re.test(readTokens())).toBe(true);
    });
  }

  // Hairline scale: cream at the four border alphas the export uses.
  const HAIRLINES: Array<[string, RegExp]> = [
    [
      ".22",
      /--[\w-]+\s*:\s*rgba\(\s*237\s*,\s*227\s*,\s*207\s*,\s*0?\.22\s*\)/i,
    ],
    [
      ".18",
      /--[\w-]+\s*:\s*rgba\(\s*237\s*,\s*227\s*,\s*207\s*,\s*0?\.18\s*\)/i,
    ],
    [
      ".12",
      /--[\w-]+\s*:\s*rgba\(\s*237\s*,\s*227\s*,\s*207\s*,\s*0?\.12\s*\)/i,
    ],
    [
      ".09",
      /--[\w-]+\s*:\s*rgba\(\s*237\s*,\s*227\s*,\s*207\s*,\s*0?\.09\s*\)/i,
    ],
  ];
  for (const [label, re] of HAIRLINES) {
    test(`custom property for hairline rgba(237,227,207,${label})`, () => {
      expect(re.test(readTokens())).toBe(true);
    });
  }

  const FONTS: Array<[string, RegExp]> = [
    ["Playfair Display", /--[\w-]+\s*:\s*[^;{}]*Playfair\s+Display/i],
    ["IBM Plex Mono", /--[\w-]+\s*:\s*[^;{}]*IBM\s+Plex\s+Mono/i],
    ["Lora", /--[\w-]+\s*:\s*[^;{}]*\bLora\b/i],
  ];
  for (const [label, re] of FONTS) {
    test(`custom property for font family ${label}`, () => {
      expect(re.test(readTokens())).toBe(true);
    });
  }
});

// ── AC-8 · component + page layers reference tokens, never raw values ──────
describe("AC-8 components.css / page.css hold no raw hex or !important", () => {
  // "hex lives only in tokens.css" — components/page colour comes via var().
  test("components.css has no raw colour hex", () => {
    expect(HEX_COLOR.test(readComponents())).toBe(false);
  });
  test("page.css has no raw colour hex", () => {
    expect(HEX_COLOR.test(readPage())).toBe(false);
  });
  // The export's responsive overrides only needed !important to beat inline
  // desktop styles; with inline styles gone and page.css last in the cascade,
  // nothing needs it.
  test("components.css has no !important", () => {
    expect(/!important/i.test(readComponents())).toBe(false);
  });
  test("page.css has no !important", () => {
    expect(/!important/i.test(readPage())).toBe(false);
  });
});

// ── AC-9 · semantic document structure ─────────────────────────────────────
describe("AC-9 semantic landmarks + single h1", () => {
  test("uses header, nav, main, footer landmarks and exactly one h1", () => {
    const doc = readIndex();
    expect(/<nav[\s>]/i.test(doc)).toBe(true);
    expect(/<header[\s>]/i.test(doc)).toBe(true);
    expect(/<main[\s>]/i.test(doc)).toBe(true);
    expect(/<footer[\s>]/i.test(doc)).toBe(true);
    const h1s = doc.match(/<h1[\s>]/gi) ?? [];
    expect(h1s.length).toBe(1);
  });
});

// ── AC-10 · every section's copy survives the rebuild (parity guards) ──────
// GREEN NOW and after the rebuild — these guard the port against dropping copy
// while it restructures. Spot-pins the load-bearing string of each section;
// overlaps landing.test.ts AC-1 by design so this file fully specifies
// "identical copy across every section." (Machine tests cannot assert pixel
// parity; token-value equality (AC-7) + this copy set are the string-level
// proxy — true visual parity still needs a human/visual review.)
describe("AC-10 copy parity across sections", () => {
  const COPY: Array<[string, string]> = [
    ["hero h1", "The revenue operating system for Indian real"],
    ["hero CTA — run pilot", "RUN OUR PILOT"],
    ["hero CTA — see engine", "SEE THE ENGINE"],
    ["stage 1 title", "Answer fast"],
    ["stage 2 title", "Score intent"],
    ["stage 3 title", "Qualify"],
    ["stage 4 title", "Book visit"],
    ["low intent label", "LOW INTENT"],
    ["high intent label", "HIGH INTENT"],
    ["plan — pilot", "Pilot"],
    ["plan — funnel engine", "Funnel Engine"],
    ["plan — revenue os", "Revenue OS"],
    ["faq question", "Is this compliant with TRAI and DND rules?"],
  ];
  for (const [label, needle] of COPY) {
    test(`keeps copy: ${label}`, () => {
      expect(readIndex()).toContain(needle);
    });
  }
});

// ── AC-11 · restored .ro-stage base rule (PR #69 review round 1 guard) ─────
// Regression guard. The single-file export styled every funnel stage card with
// an inline style — padding:38px 34px 44px; border-right:1px solid
// rgba(237,227,207,.12); display:flex; flex-direction:column; gap:14px. The
// task-29 extraction lifted .ro-stage:hover into components.css but DROPPED this
// base rule, so above 680px the four cards rendered unpadded, undivided and
// unstacked (caught in PR #69 review). The @1100 / @680 media rules only OVERRIDE
// on top of this base, so the fix — and this guard — is a NON-media .ro-stage
// rule in page.css carrying the flex-column + gap + padding + border-right set.
describe("AC-11 restored .ro-stage base rule (PR #69 review round 1)", () => {
  const DECLS: Array<[string, RegExp]> = [
    ["display:flex", /display\s*:\s*flex\b/],
    ["flex-direction:column", /flex-direction\s*:\s*column\b/],
    ["gap:14px", /gap\s*:\s*14px\b/],
    ["padding:38px 34px 44px", /padding\s*:\s*38px\s+34px\s+44px\b/],
    [
      "border-right via --hairline-12",
      /border-right\s*:\s*1px\s+solid\s+var\(--hairline-12\)/,
    ],
  ];
  test("a non-media .ro-stage base rule exists in page.css", () => {
    // Slice off everything from the first @media onward, leaving only the base
    // (non-responsive) cascade layer — so a match here is provably non-media.
    const base = readPage().split("@media")[0] ?? "";
    const rule = /\.ro-stage\s*\{([^}]*)\}/.exec(base);
    expect(
      rule,
      "a non-media .ro-stage base rule must exist in page.css",
    ).not.toBeNull();
    const body = rule?.[1] ?? "";
    for (const [label, re] of DECLS) {
      expect(re.test(body), `.ro-stage base rule must declare ${label}`).toBe(
        true,
      );
    }
  });
});
