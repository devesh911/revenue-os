// RED spec for TASK-26 — static marketing landing page ported into apps/www.
// The artifact under test is apps/www/index.html (+ apps/www/fonts/*). This is a
// pure string/regex contract against that built file: env-free, no DOM libs, no
// new deps. Every content anchor was grep-validated against the source export
// (scratchpad/extract/template.html) before being baked in here.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const WWW_DIR = resolve(import.meta.dir, "..");
const INDEX_PATH = resolve(WWW_DIR, "index.html");
// REBUILT-SPEC (task-29 www rebuild): the CSS layer moved out of index.html's
// inline <style> block into styles/*.css. AC-3 (self-hosted fonts) below now
// reads the @font-face rules from styles/tokens.css — the token file that owns
// the three font families — instead of index.html. Font url()s in tokens.css
// resolve relative to the styles/ directory (i.e. ../fonts/<file>.woff2).
const STYLES_DIR = resolve(WWW_DIR, "styles");
const TOKENS_PATH = resolve(STYLES_DIR, "tokens.css");

// − is U+2212 MINUS SIGN (the "open" FAQ marker in the source); the "closed"
// marker is an ASCII "+". Spelled as an escape so it can never be confused with
// an ASCII hyphen-minus that appears in body copy (e.g. "code-switch").
const OPEN_MARK = "−";

// Read the built page. Existence is asserted first so an unbuilt page fails as a
// clear assertion (the RED reason) rather than an opaque filesystem throw.
function readIndex(): string {
  expect(
    existsSync(INDEX_PATH),
    `apps/www/index.html must exist (built landing page): ${INDEX_PATH}`,
  ).toBe(true);
  return readFileSync(INDEX_PATH, "utf8");
}

// REBUILT-SPEC (task-29): read the extracted token stylesheet. Existence is
// asserted first so the pre-rebuild state fails as a clear assertion (tokens.css
// not yet built) rather than an opaque filesystem throw — same pattern as
// readIndex above.
function readTokens(): string {
  expect(
    existsSync(TOKENS_PATH),
    `apps/www/styles/tokens.css must exist (extracted token layer): ${TOKENS_PATH}`,
  ).toBe(true);
  return readFileSync(TOKENS_PATH, "utf8");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// First opening tag whose attribute text contains `needle`; "" if none found.
function openingTagWith(doc: string, needle: string): string {
  const m = new RegExp(`<[a-zA-Z][^>]*${escapeRe(needle)}[^>]*>`).exec(doc);
  return m ? m[0] : "";
}

// Substring covering one FAQ item: from data-faq="i" to the next data-faq= (or
// end of document). Lets us bind a toggle marker to a specific FAQ index.
function faqBlock(doc: string, i: number): string {
  const start = doc.indexOf(`data-faq="${i}"`);
  if (start < 0) return "";
  const after = doc.slice(start + 1);
  const rel = after.indexOf('data-faq="');
  const end = rel < 0 ? doc.length : start + 1 + rel;
  return doc.slice(start, end);
}

// ── AC-1 · content fidelity ────────────────────────────────────────────────
// The page must carry the key copy from template.html + its logic-block data.
describe("AC-1 content fidelity", () => {
  test("hero h1 headline", () => {
    // Source has a non-breaking space between "real" and "estate"; anchor on the
    // stable stem so the assertion is robust to nbsp / entity rendering choices.
    expect(readIndex()).toContain(
      "The revenue operating system for Indian real",
    );
  });

  test("section headings", () => {
    const doc = readIndex();
    for (const head of [
      "FOUR STAGES RUN ON MACHINE TIME",
      "THREE COMPETITORS, THREE MOATS",
      "CHOOSE A PLAN TO CONNECT REVENUE OS",
      "ASKED BEFORE EVERY PILOT",
    ]) {
      expect(doc).toContain(head);
    }
  });

  test("guarantee headline (footer CTA)", () => {
    const doc = readIndex();
    // Apostrophe-free fragments — robust to straight vs. curly quote styling.
    expect(doc).toContain("Give us one project");
    expect(doc).toContain("beat your telecalling team");
  });

  test("four stage titles", () => {
    const doc = readIndex();
    for (const title of [
      "Answer fast",
      "Score intent",
      "Qualify",
      "Book visit",
    ]) {
      expect(doc).toContain(title);
    }
  });

  test("three moat titles", () => {
    const doc = readIndex();
    for (const title of [
      "Vertical depth beats breadth",
      "Built for India, not ported",
      "The data loop, not the calling",
    ]) {
      expect(doc).toContain(title);
    }
  });

  test("three plan names and prices", () => {
    const doc = readIndex();
    for (const token of [
      "Pilot",
      "Funnel Engine",
      "Revenue OS",
      "₹0",
      "₹60K",
      "Custom",
    ]) {
      expect(doc).toContain(token);
    }
  });

  test("five FAQ questions", () => {
    const doc = readIndex();
    for (const q of [
      "Is this compliant with TRAI and DND rules?",
      "Can the agents actually handle Hinglish?",
      "Does it replace my telecalling team?",
      "How does outcome pricing work?",
      "What does the pilot involve?",
    ]) {
      expect(doc).toContain(q);
    }
  });

  test("five client logos", () => {
    const doc = readIndex();
    for (const logo of [
      "MERIDIAN",
      "VASTU ONE",
      "GRIHA CO.",
      "NORTHGATE",
      "ANVAYA",
    ]) {
      expect(doc).toContain(logo);
    }
  });
});
// ── AC-2 · self-containment ────────────────────────────────────────────────
// No artifact scaffolding, no external requests; every reference it keeps must
// resolve to a file that ships under apps/www/.
describe("AC-2 self-containment", () => {
  const FORBIDDEN: Array<[string, string]> = [
    ["mustache placeholders", "{{"],
    ["bundler marker", "__bundler"],
    ["artifact script type", "text/x-dc"],
    ["artifact root element", "<x-dc"],
    ["image-slot elements", "image-slot"],
    ["unpkg CDN host", "unpkg.com"],
    ["google fonts host", "fonts.googleapis"],
  ];
  for (const [label, token] of FORBIDDEN) {
    test(`omits ${label}`, () => {
      expect(readIndex()).not.toContain(token);
    });
  }

  test("omits any React runtime reference", () => {
    expect(readIndex().toLowerCase()).not.toContain("react");
  });

  test("omits uuid-named asset references", () => {
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
    expect(uuid.test(readIndex())).toBe(false);
  });

  test("no external http(s) src/href on script/link/img tags", () => {
    const ext =
      /<(?:script|link|img)\b[^>]*\b(?:src|href)\s*=\s*["']https?:\/\//i;
    expect(ext.test(readIndex())).toBe(false);
  });

  // Artifact scaffolding a self-contained port must resolve/remove entirely.
  const SCAFFOLD = [
    "sc-if",
    "sc-for",
    "sc-camel-on-click",
    "style-hover",
    "data-screen-label",
    "hint-placeholder",
    "data-dc-script",
    "<helmet",
  ];
  for (const token of SCAFFOLD) {
    test(`removes artifact scaffolding: ${token}`, () => {
      expect(readIndex()).not.toContain(token);
    });
  }

  test("every url() reference resolves to a file under apps/www/", () => {
    const doc = readIndex();
    const skip = (v: string) =>
      v.startsWith("data:") ||
      v.startsWith("#") ||
      v.startsWith("%23") ||
      v.startsWith("//") ||
      /^https?:/i.test(v);
    const refs = [...doc.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)]
      .map((m) => (m[1] ?? "").trim())
      .filter((v) => v.length > 0 && !skip(v));
    for (const ref of refs) {
      const clean = (ref.split("?")[0] ?? ref).split("#")[0] ?? ref;
      expect(existsSync(resolve(WWW_DIR, clean))).toBe(true);
    }
  });

  test("every local src/href resolves to a file under apps/www/", () => {
    const doc = readIndex();
    const skip = (v: string) =>
      v.startsWith("#") ||
      v.startsWith("data:") ||
      v.startsWith("//") ||
      v.startsWith("mailto:") ||
      v.startsWith("tel:") ||
      /^https?:/i.test(v);
    const refs = [...doc.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
      .map((m) => (m[1] ?? "").trim())
      .filter((v) => v.length > 0 && !skip(v));
    for (const ref of refs) {
      const clean = (ref.split("?")[0] ?? ref).split("#")[0] ?? ref;
      expect(existsSync(resolve(WWW_DIR, clean))).toBe(true);
    }
  });
});
// ── AC-3 · self-hosted fonts (REBUILT-SPEC, task-29) ───────────────────────
// Same invariant as the original export (both display families, the weights the
// page actually uses, every src url() resolving to a real fonts/ file) — but the
// @font-face rules now live in styles/tokens.css, not in an inline <style> block
// in index.html. Only the file under test changed: readIndex() → readTokens().
// This is a type-(b) rewrite (it pinned the single-file export's implementation)
// and is RED until the rebuild extracts the token layer.
describe("AC-3 self-hosted fonts", () => {
  function faceBlocks(css: string): string[] {
    return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(
      (m) => m[1] ?? "",
    );
  }
  const normColon = (s: string): string => s.replace(/\s*:\s*/g, ":");
  function hasFace(css: string, family: string, weight: number): boolean {
    return faceBlocks(css).some(
      (b) =>
        b.includes(family) && normColon(b).includes(`font-weight:${weight}`),
    );
  }

  test("@font-face rules present for both display families", () => {
    const css = readTokens();
    expect(css).toContain("@font-face");
    expect(faceBlocks(css).some((b) => b.includes("Playfair Display"))).toBe(
      true,
    );
    expect(faceBlocks(css).some((b) => b.includes("IBM Plex Mono"))).toBe(true);
  });

  test("covers the weights the page actually uses", () => {
    const css = readTokens();
    // Playfair Display renders at 500 (all headings); IBM Plex Mono at 400 + 500.
    expect(hasFace(css, "Playfair Display", 500)).toBe(true);
    expect(hasFace(css, "IBM Plex Mono", 400)).toBe(true);
    expect(hasFace(css, "IBM Plex Mono", 500)).toBe(true);
  });

  test("@font-face src url()s point at fonts/ files that exist", () => {
    const css = readTokens();
    const urls = faceBlocks(css)
      .flatMap((b) => [...b.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)])
      .map((m) => (m[1] ?? "").trim())
      .filter((v) => v.length > 0 && !v.startsWith("data:"));
    expect(urls.length).toBeGreaterThanOrEqual(3);
    for (const u of urls) {
      expect(u).toContain("fonts/");
      const clean = (u.split("?")[0] ?? u).split("#")[0] ?? u;
      // url()s in tokens.css are relative to its own dir (styles/), per CSS
      // semantics — so ../fonts/<file> must resolve into apps/www/fonts/.
      expect(existsSync(resolve(STYLES_DIR, clean))).toBe(true);
    }
  });
});
// ── AC-4 · default state + interactivity contract ──────────────────────────
// Default UI state is baked into the markup (funnel selected, FAQ 0 open) and a
// single inline script wires the interactivity via the data attributes.
describe("AC-4 default state + interactivity", () => {
  test("funnel plan selected by default; pilot and os not", () => {
    const doc = readIndex();
    const funnel = openingTagWith(doc, 'data-plan="funnel"');
    const pilot = openingTagWith(doc, 'data-plan="pilot"');
    const os = openingTagWith(doc, 'data-plan="os"');
    expect(funnel).not.toBe("");
    expect(pilot).not.toBe("");
    expect(os).not.toBe("");
    expect(funnel).toContain('data-selected="true"');
    expect(pilot).toContain('data-selected="false"');
    expect(os).toContain('data-selected="false"');
  });

  test("all five FAQ items carry data-faq indices", () => {
    const doc = readIndex();
    for (let i = 0; i < 5; i++) {
      expect(doc).toContain(`data-faq="${i}"`);
    }
  });

  test("FAQ item 0 is statically open; item 1 is closed", () => {
    const doc = readIndex();
    // Answer copy for item 0 is present in the markup (apostrophe-free anchor).
    expect(doc).toContain("honors DND registries");
    const first = faqBlock(doc, 0);
    const second = faqBlock(doc, 1);
    expect(first).not.toBe("");
    expect(second).not.toBe("");
    expect(first).toContain(OPEN_MARK); // − open
    expect(second).toContain("+"); // + closed
    expect(second).not.toContain(OPEN_MARK);
  });

  test("exactly one inline <script> that references the data hooks", () => {
    const doc = readIndex();
    const opens = doc.match(/<script\b/gi) ?? [];
    expect(opens.length).toBe(1);
    const openTag = /<script\b([^>]*)>/i.exec(doc);
    expect(openTag).not.toBeNull();
    expect(openTag?.[1] ?? "").not.toContain("src"); // inline, no external src
    const bodyMatch = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(doc);
    const code = bodyMatch?.[1] ?? "";
    expect(code).toContain("data-plan");
    expect(code).toContain("data-faq");
  });
});
