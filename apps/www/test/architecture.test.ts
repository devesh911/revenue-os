// RED spec for TASK-34 — www componentization · ARCHITECTURE (source-level).
// Pins the TARGET file layout the GREEN rebuild produces — the component surface
// matching the console's stack (react + vite + tailwind v4). Pure fs + regex over
// SOURCE (no imports, no build): env-free, no DOM libs, no new deps — same posture
// as the retired structure.test.ts, one layer up (files/exports/separation instead
// of a single index.html string).
//
// Carries forward, restated against src/: self-hosted fonts (AC-3), self-containment
// (AC-2), and "raw hex lives in ONE place" (AC-7/AC-8 — now src/styles.css @theme).
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const WWW_DIR = resolve(import.meta.dir, "..");
const SRC_DIR = resolve(WWW_DIR, "src");
const STYLES = resolve(SRC_DIR, "styles.css");

// Read a file, or "" when absent — so a missing artifact fails as a clear content
// assertion (the RED reason) rather than an opaque fs throw.
function read(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

// Recursively collect files under `dir` whose name ends with one of `exts`.
function walk(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => ent.name.endsWith(e))) out.push(full);
  }
  return out;
}

// A NAMED export of `name`: `export function|const|class Name`, or `export { Name }`.
// Named exports are the console idiom (export function App / AppShell / Button …).
function exportsName(src: string, name: string): boolean {
  return (
    new RegExp(
      `export\\s+(?:async\\s+)?(?:function|const|class)\\s+${name}\\b`,
    ).test(src) ||
    new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(src)
  );
}

// ── vite entry wiring: index.html → src/main.tsx → src/App.tsx ──────────────
describe("architecture — vite entry wiring", () => {
  test("index.html mounts the app via src/main.tsx", () => {
    const html = read(resolve(WWW_DIR, "index.html"));
    expect(html).toContain("/src/main.tsx");
    expect(html).toContain('id="root"');
  });

  test("src/main.tsx imports App and the stylesheet", () => {
    const p = resolve(SRC_DIR, "main.tsx");
    expect(existsSync(p), `${p} must exist`).toBe(true);
    const src = read(p);
    // main.tsx owns the CSS side-effect import, keeping App SSR-safe.
    expect(
      /from\s+["']\.\/App["']/.test(src),
      "main.tsx must import ./App",
    ).toBe(true);
    expect(
      /["']\.\/styles\.css["']/.test(src),
      "main.tsx must import ./styles.css",
    ).toBe(true);
  });

  test("src/App.tsx exists and exports App", () => {
    const p = resolve(SRC_DIR, "App.tsx");
    expect(existsSync(p), `${p} must exist`).toBe(true);
    expect(exportsName(read(p), "App"), "App.tsx must export App").toBe(true);
  });
});

// ── src/styles.css owns the @theme tokens (raw hex lives ONLY here) ──────────
describe("architecture — src/styles.css @theme tokens", () => {
  test("imports tailwind and declares an @theme block", () => {
    expect(existsSync(STYLES), `${STYLES} must exist`).toBe(true);
    const css = read(STYLES);
    expect(css).toContain('@import "tailwindcss"');
    expect(/@theme\b/.test(css)).toBe(true);
  });

  // EXACT palette values (case-insensitive hex) — the warm paper / ink / clay
  // system. Alpha tiers are Tailwind `/<alpha>` modifiers on these, not tokens.
  const TOKENS: Array<[string, RegExp]> = [
    ["paper #FAF9F5", /--color-paper\s*:\s*#FAF9F5\b/i],
    ["paper-2 #F0EEE6", /--color-paper-2\s*:\s*#F0EEE6\b/i],
    ["line #E8E6DC", /--color-line\s*:\s*#E8E6DC\b/i],
    ["ink #141413", /--color-ink\s*:\s*#141413\b/i],
    ["clay #D97757", /--color-clay\s*:\s*#D97757\b/i],
    ["clay-deep #A9492A", /--color-clay-deep\s*:\s*#A9492A\b/i],
    ["olive #788C5D", /--color-olive\s*:\s*#788C5D\b/i],
    // the text tiers the ≥4.5:1 contrast floor rests on
    ["ink-2 #3D3D3A", /--color-ink-2\s*:\s*#3D3D3A\b/i],
    ["stone #6B6A64", /--color-stone\s*:\s*#6B6A64\b/i],
    ["olive-deep #56663F", /--color-olive-deep\s*:\s*#56663F\b/i],
  ];
  for (const [label, re] of TOKENS) {
    test(`defines token: ${label}`, () => {
      expect(re.test(read(STYLES))).toBe(true);
    });
  }

  // Motion safety floor: every animation is switched off under reduced motion,
  // and the scroll reveal only hides content behind the JS opt-in html[data-motion].
  test("honours prefers-reduced-motion", () => {
    expect(read(STYLES)).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
    );
  });
  test("scroll reveal hides content only behind html[data-motion]", () => {
    const css = read(STYLES);
    const hides = [
      ...css.matchAll(/([^{}]*\[data-reveal\][^{}]*)\{[^}]*opacity:\s*0\b/g),
    ];
    expect(hides.length).toBeGreaterThan(0);
    for (const m of hides) expect(m[1]).toContain("html[data-motion]");
  });

  for (const fam of ["Lora", "IBM Plex Mono"]) {
    test(`declares font family ${fam}`, () => {
      expect(read(STYLES)).toContain(fam);
    });
  }
});

// ── self-hosted fonts (carries AC-3): @font-face url()s stay local ──────────
describe("architecture — @font-face self-hosting in src/styles.css", () => {
  const faceBlocks = (css: string): string[] =>
    [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");

  test("both self-hosted families have @font-face rules", () => {
    const blocks = faceBlocks(read(STYLES));
    expect(blocks.some((b) => b.includes("Lora"))).toBe(true);
    expect(blocks.some((b) => b.includes("IBM Plex Mono"))).toBe(true);
  });

  test("every @font-face src url() is a local ../fonts/ file that exists", () => {
    const urls = faceBlocks(read(STYLES))
      .flatMap((b) => [...b.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)])
      .map((m) => (m[1] ?? "").trim())
      .filter((u) => u.length > 0 && !u.startsWith("data:"));
    expect(urls.length).toBeGreaterThanOrEqual(3);
    for (const u of urls) {
      expect(u, `font url must be local (../fonts/…): ${u}`).toContain(
        "fonts/",
      );
      expect(/^https?:/i.test(u), `font url must not be external: ${u}`).toBe(
        false,
      );
      const clean = (u.split("?")[0] ?? u).split("#")[0] ?? u;
      // url()s in src/styles.css resolve relative to its dir (src/) → ../fonts/<f>.
      expect(
        existsSync(resolve(SRC_DIR, clean)),
        `must resolve: ${clean}`,
      ).toBe(true);
    }
  });
});

// ── design elements: one file each, exports its component ───────────────────
describe("architecture — src/design/ reusable elements", () => {
  const DESIGN = [
    "Heading",
    "Text",
    "Kicker",
    "MonoLabel",
    "CtaButton",
    "SectionFrame",
  ];
  for (const name of DESIGN) {
    test(`src/design/${name}.tsx exists and exports ${name}`, () => {
      const p = resolve(SRC_DIR, "design", `${name}.tsx`);
      expect(existsSync(p), `${p} must exist`).toBe(true);
      expect(exportsName(read(p), name), `must export ${name}`).toBe(true);
    });
  }

  test("CtaButton declares accent + ghost variants", () => {
    const src = read(resolve(SRC_DIR, "design", "CtaButton.tsx"));
    expect(src).toContain("accent");
    expect(src).toContain("ghost");
  });
});

// ── visuals: the animated set pieces, one file each ─────────────────────────
describe("architecture — src/visuals/ animated set pieces", () => {
  for (const name of [
    "BrandMark",
    "HeroCall",
    "FunnelFlow",
    "MoatArt",
    "CallArt",
  ]) {
    test(`src/visuals/${name}.tsx exists and exports ${name}`, () => {
      const p = resolve(SRC_DIR, "visuals", `${name}.tsx`);
      expect(existsSync(p), `${p} must exist`).toBe(true);
      expect(exportsName(read(p), name), `must export ${name}`).toBe(true);
    });
  }
});

// ── sections: one file each, exports its component ──────────────────────────
describe("architecture — src/sections/ compose design elements", () => {
  const SECTIONS = [
    "Nav",
    "Hero",
    "Logos",
    "StageGrid",
    "IntentRouting",
    "Moats",
    "Pricing",
    "Faq",
    "FooterCta",
  ];
  for (const name of SECTIONS) {
    test(`src/sections/${name}.tsx exists and exports ${name}`, () => {
      const p = resolve(SRC_DIR, "sections", `${name}.tsx`);
      expect(existsSync(p), `${p} must exist`).toBe(true);
      expect(exportsName(read(p), name), `must export ${name}`).toBe(true);
    });
  }
});

// ── content modules: typed data holding the copy (separation of concerns) ───
describe("architecture — src/content/ typed data modules", () => {
  const CONTENT: Array<[string, string[]]> = [
    ["plans", ["Pilot", "Funnel Engine", "Revenue OS", "₹0", "₹60K", "Custom"]],
    ["stages", ["Answer fast", "Score intent", "Qualify", "Book visit"]],
    [
      "faqs",
      ["Is this compliant with TRAI and DND rules?", "honors DND registries"],
    ],
    [
      "moats",
      [
        "Vertical depth beats breadth",
        "Built for India, not ported",
        "The data loop, not the calling",
        "Namaste",
        "INVENTORY",
      ],
    ],
    ["logos", ["MERIDIAN", "VASTU ONE", "GRIHA CO.", "NORTHGATE", "ANVAYA"]],
    ["hero", ["Site visit booked", "Nurture loop"]],
    ["site", ["How it works", "Book a pilot", "Pause animations"]],
    ["cta", ["Give us one project"]],
  ];
  for (const [mod, strings] of CONTENT) {
    test(`src/content/${mod}.ts exists, is typed, and holds its copy`, () => {
      const p = resolve(SRC_DIR, "content", `${mod}.ts`);
      expect(existsSync(p), `${p} must exist`).toBe(true);
      const src = read(p);
      expect(/export\s+const\s+\w+/.test(src), "must export a const").toBe(
        true,
      );
      expect(
        /\bas\s+const\b|\binterface\s+\w+|\btype\s+\w+/.test(src),
        "must carry a TypeScript type (interface / type / as const)",
      ).toBe(true);
      for (const s of strings) expect(src).toContain(s);
    });
  }
});

// ── sections import content, never inline it ────────────────────────────────
describe("architecture — sections import content, never inline it", () => {
  // [dir/file, content module, strings that MUST live in content — not the file]
  const SEPARATION: Array<[string, string, string[]]> = [
    ["sections/StageGrid", "stages", ["Answer fast", "Score intent"]],
    ["sections/Moats", "moats", ["Vertical depth beats breadth"]],
    ["sections/Pricing", "plans", ["Funnel Engine", "₹60K"]],
    ["sections/Faq", "faqs", ["Is this compliant with TRAI and DND rules?"]],
    ["sections/Logos", "logos", ["MERIDIAN", "ANVAYA"]],
    ["sections/Nav", "site", ["How it works", "Book a pilot"]],
    ["sections/Hero", "hero", ["Run our pilot", "See the engine"]],
    ["sections/IntentRouting", "stages", ["HIGH INTENT", "LOW INTENT"]],
    ["sections/FooterCta", "cta", ["Give us one project"]],
    ["visuals/HeroCall", "hero", ["Site visit booked"]],
    ["visuals/FunnelFlow", "stages", ["Human closer"]],
    ["visuals/MoatArt", "moats", ["Namaste", "INVENTORY"]],
  ];
  for (const [section, mod, strings] of SEPARATION) {
    test(`${section} imports ../content/${mod} and inlines none of its data`, () => {
      const p = resolve(SRC_DIR, `${section}.tsx`);
      expect(existsSync(p), `${p} must exist`).toBe(true);
      const src = read(p);
      expect(
        new RegExp(`from\\s+["'][^"']*content/${mod}(?:\\.[jt]sx?)?["']`).test(
          src,
        ),
        `${section} must import from ../content/${mod}`,
      ).toBe(true);
      for (const s of strings) {
        expect(
          src.includes(s),
          `${section} must NOT inline "${s}" — it lives in content/${mod}`,
        ).toBe(false);
      }
    });
  }
});

// ── raw colour hex lives ONLY in src/styles.css (carries AC-7/AC-8) ─────────
const HEX_COLOR = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/;
describe("architecture — raw hex only in src/styles.css", () => {
  test("no raw colour hex in any src/**/*.{ts,tsx}", () => {
    const offenders = walk(SRC_DIR, [".ts", ".tsx"]).filter((f) =>
      HEX_COLOR.test(read(f)),
    );
    expect(
      offenders.length,
      `raw hex found in: ${offenders.map((f) => f.replace(SRC_DIR, "src")).join(", ")}`,
    ).toBe(0);
  });
});

// ── self-containment (carries AC-2): zero external URLs anywhere in src/ ─────
describe("architecture — self-containment: no external URLs in src/", () => {
  test("no external http(s) URLs (XML/SVG namespaces excepted)", () => {
    const hits: string[] = [];
    for (const f of walk(SRC_DIR, [".ts", ".tsx", ".css"])) {
      for (const m of read(f).matchAll(/https?:\/\/[^\s"')]+/gi)) {
        const u = m[0];
        if (/^https?:\/\/www\.w3\.org\//i.test(u)) continue; // namespace, never fetched
        hits.push(`${f.replace(SRC_DIR, "src")}: ${u}`);
      }
    }
    expect(hits.length, `external URLs found:\n${hits.join("\n")}`).toBe(0);
  });

  test("no CDN font/script hosts referenced in src/", () => {
    const all = walk(SRC_DIR, [".ts", ".tsx", ".css"]).map(read).join("\n");
    expect(all).not.toContain("fonts.googleapis");
    expect(all).not.toContain("unpkg.com");
  });
});

// ── README documents the new component layout (incl. "adding a page") ───────
describe("architecture — README documents the component layout", () => {
  const readme = () => read(resolve(WWW_DIR, "README.md"));
  test("references the component structure (sections/design/content + vite)", () => {
    expect(existsSync(resolve(WWW_DIR, "README.md"))).toBe(true);
    const r = readme();
    expect(r).toContain("src/sections");
    expect(r).toContain("src/design");
    expect(r).toContain("src/content");
    expect(r.toLowerCase()).toContain("vite");
  });

  test("carries an 'adding a page' note (future contact-us)", () => {
    expect(readme().toLowerCase()).toContain("adding a page");
  });
});
