// Architecture spec for the demo-first landing page (v2) — source-level, env-free
// (pure fs + regex; no DOM, no build). Pins the file layout, the design-system
// tokens and type ranking, content separation, motion discipline, and the
// self-containment rules (self-hosted fonts; the only external host is the
// booking API, in one file).
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const WWW_DIR = resolve(import.meta.dir, "..");
const SRC_DIR = resolve(WWW_DIR, "src");
const STYLES = resolve(SRC_DIR, "styles.css");

// Read a file, or "" when absent — a missing artifact fails as a clear assertion.
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

const rel = (f: string) => relative(SRC_DIR, f);
const sources = () => walk(SRC_DIR, [".ts", ".tsx"]);

// A NAMED export of `name`: `export function|const|class Name`, or `export { Name }`.
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
    const src = read(resolve(SRC_DIR, "main.tsx"));
    expect(/from\s+["']\.\/App["']/.test(src)).toBe(true);
    expect(/["']\.\/styles\.css["']/.test(src)).toBe(true);
  });

  test("src/App.tsx exports App", () => {
    expect(exportsName(read(resolve(SRC_DIR, "App.tsx")), "App")).toBe(true);
  });
});

// ── the visual system: tokens (raw hex lives ONLY in styles.css) ─────────────
describe("architecture — src/styles.css tokens", () => {
  test("imports tailwind and declares an @theme block", () => {
    const css = read(STYLES);
    expect(css).toContain('@import "tailwindcss"');
    expect(/@theme\b/.test(css)).toBe(true);
  });

  const TOKENS: Array<[string, string]> = [
    ["paper", "#F7F6F2"],
    ["wash", "#EFEDE7"],
    ["surface", "#FFFFFF"],
    ["line", "#E2E0D8"],
    ["ink", "#191A17"],
    ["ink-2", "#62645E"],
    ["clay", "#D97757"],
    ["clay-deep", "#A9492A"],
    ["olive-deep", "#56663F"],
  ];
  for (const [name, hex] of TOKENS) {
    test(`defines --color-${name}: ${hex}`, () => {
      expect(
        new RegExp(`--color-${name}\\s*:\\s*${hex}\\b`, "i").test(read(STYLES)),
      ).toBe(true);
    });
  }

  test("honours prefers-reduced-motion", () => {
    expect(read(STYLES)).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
    );
  });
});

// ── type ranking + motion discipline (items 5 and 11) ────────────────────────
describe("architecture — type ranking and motion discipline", () => {
  test("serif appears only in design/Heading.tsx (hero + closing statement)", () => {
    const offenders = sources()
      .filter((f) => read(f).includes("font-serif"))
      .map(rel)
      .filter((f) => f !== "design/Heading.tsx");
    expect(offenders, `font-serif outside Heading: ${offenders}`).toEqual([]);
  });

  test("no upper-case utility labels anywhere", () => {
    const offenders = sources()
      .filter((f) => /(?:^|[\s"'`])uppercase(?:[\s"'`]|$)/m.test(read(f)))
      .map(rel);
    expect(offenders, `uppercase in: ${offenders}`).toEqual([]);
  });

  test("looping animation lives only in the sample player", () => {
    const offenders = sources()
      .filter((f) => /infinite/.test(read(f)))
      .map(rel)
      .filter((f) => f !== "visuals/SampleCall.tsx");
    expect(offenders, `infinite animation in: ${offenders}`).toEqual([]);
  });

  test("no scroll-reveal hiding: content is visible on first paint", () => {
    const all = sources().map(read).join("\n") + read(STYLES);
    expect(all).not.toContain("data-reveal");
    expect(all).not.toContain("IntersectionObserver(");
  });
});

// ── fonts are self-hosted ────────────────────────────────────────────────────
describe("architecture — self-hosted fonts", () => {
  const faceBlocks = (css: string): string[] =>
    [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");

  test("Lora and IBM Plex Mono have @font-face rules", () => {
    const blocks = faceBlocks(read(STYLES));
    expect(blocks.some((b) => b.includes("Lora"))).toBe(true);
    expect(blocks.some((b) => b.includes("IBM Plex Mono"))).toBe(true);
  });

  test("every @font-face url() is a local ../fonts/ file that exists", () => {
    const urls = faceBlocks(read(STYLES))
      .flatMap((b) => [...b.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)])
      .map((m) => (m[1] ?? "").trim());
    expect(urls.length).toBeGreaterThanOrEqual(3);
    for (const u of urls) {
      expect(u).toContain("fonts/");
      expect(/^https?:/i.test(u)).toBe(false);
      expect(existsSync(resolve(SRC_DIR, u)), `must resolve: ${u}`).toBe(true);
    }
  });
});

// ── file layout: design / sections / visuals / lib ───────────────────────────
describe("architecture — component layout", () => {
  const LAYOUT: Array<[string, string[]]> = [
    ["design", ["Heading", "Text", "Label", "Button", "Section", "Card"]],
    [
      "sections",
      [
        "Nav",
        "Hero",
        "Proof",
        "HowItWorks",
        "Examples",
        "Pilot",
        "Faq",
        "ClosingCta",
      ],
    ],
    ["visuals", ["BrandMark", "Icon", "SampleCall", "BookingDialog"]],
  ];
  for (const [dir, names] of LAYOUT) {
    for (const name of names) {
      test(`src/${dir}/${name}.tsx exports ${name}`, () => {
        const p = resolve(SRC_DIR, dir, `${name}.tsx`);
        expect(existsSync(p), `${p} must exist`).toBe(true);
        expect(exportsName(read(p), name)).toBe(true);
      });
    }
  }

  test("lib exposes the booking client, analytics and the booking context", () => {
    expect(
      exportsName(
        read(resolve(SRC_DIR, "lib/booking.ts")),
        "createBookingClient",
      ),
    ).toBe(true);
    expect(
      exportsName(read(resolve(SRC_DIR, "lib/analytics.ts")), "track"),
    ).toBe(true);
    const ctx = read(resolve(SRC_DIR, "lib/bookingContext.tsx"));
    expect(exportsName(ctx, "BookingProvider")).toBe(true);
    expect(exportsName(ctx, "BookDemoButton")).toBe(true);
  });
});

// ── content: typed modules hold the copy; files import it, never inline it ──
describe("architecture — src/content/ holds the copy", () => {
  const CONTENT: Array<[string, string[]]> = [
    ["site", ["Book a demo", "How it works"]],
    [
      "hero",
      [
        "Turn property enquiries into qualified site visits.",
        "Hear a sample call",
        "Namaste Rohan ji",
      ],
    ],
    ["proof", ["Illustrative example", "Enquiries called the same day"]],
    [
      "workflow",
      ["Respond quickly", "Understand the buyer", "Arrange the next step"],
    ],
    ["examples", ["Built around how property sales actually work"]],
    ["pilot", ["Start with a four-week pilot", "How fees work"]],
    ["faqs", ["How natural does the voice sound?"]],
    [
      "closing",
      ["See how Revenue OS would handle your next property enquiry."],
    ],
    ["booking", ["Choose a time", "Work email"]],
  ];
  for (const [mod, strings] of CONTENT) {
    test(`src/content/${mod}.ts is typed and holds its copy`, () => {
      const src = read(resolve(SRC_DIR, "content", `${mod}.ts`));
      expect(/export\s+const\s+\w+/.test(src)).toBe(true);
      expect(
        /\bas\s+const\b|\binterface\s+\w+|\btype\s+\w+|\bsatisfies\b|from\s+["']\.\/site["']/.test(
          src,
        ),
      ).toBe(true);
      for (const s of strings) expect(src).toContain(s);
    });
  }

  const SEPARATION: Array<[string, string, string[]]> = [
    ["sections/Nav", "site", ["How it works"]],
    [
      "sections/Hero",
      "hero",
      ["Turn property enquiries", "Hear a sample call"],
    ],
    ["visuals/SampleCall", "hero", ["Namaste Rohan", "What the call captured"]],
    ["sections/Proof", "proof", ["Enquiries called the same day"]],
    [
      "sections/HowItWorks",
      "workflow",
      ["Respond quickly", "Not ready to visit yet?"],
    ],
    ["sections/Examples", "examples", ["A natural Hinglish conversation"]],
    ["sections/Pilot", "pilot", ["How fees work", "Who it suits"]],
    ["sections/Faq", "faqs", ["How natural does the voice sound?"]],
    ["sections/ClosingCta", "closing", ["See how Revenue OS would handle"]],
    ["visuals/BookingDialog", "booking", ["Work email", "Choose a time"]],
    ["lib/bookingContext", "site", []],
  ];
  for (const [file, mod, strings] of SEPARATION) {
    test(`${file} imports content/${mod} and inlines none of it`, () => {
      const src = read(resolve(SRC_DIR, `${file}.tsx`));
      expect(
        new RegExp(`from\\s+["'][^"']*content/${mod}["']`).test(src),
        `${file} must import content/${mod}`,
      ).toBe(true);
      for (const s of strings)
        expect(src.includes(s), `inlines "${s}"`).toBe(false);
    });
  }

  test('"Book a demo" is defined once (content/site.ts) — every primary button shares it', () => {
    const holders = sources()
      .filter((f) => read(f).includes("Book a demo"))
      .map(rel);
    expect(holders).toEqual(["content/site.ts"]);
  });
});

// ── raw colour hex lives ONLY in src/styles.css ─────────────────────────────
describe("architecture — raw hex only in src/styles.css", () => {
  test("no raw colour hex in any src/**/*.{ts,tsx}", () => {
    const offenders = sources()
      .filter((f) => /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});

// ── self-containment: the only external host is the booking API, in one file ──
describe("architecture — external hosts", () => {
  test("only lib/booking.ts reaches out, and only to api.cal.com", () => {
    const hits: string[] = [];
    for (const f of walk(SRC_DIR, [".ts", ".tsx", ".css"])) {
      for (const m of read(f).matchAll(/https?:\/\/[^\s"'`)]+/gi)) {
        const u = m[0];
        if (/^https?:\/\/www\.w3\.org\//i.test(u)) continue; // SVG namespace, never fetched
        if (rel(f) === "lib/booking.ts" && u.startsWith("https://api.cal.com/"))
          continue;
        hits.push(`${rel(f)}: ${u}`);
      }
    }
    expect(hits, `external URLs:\n${hits.join("\n")}`).toEqual([]);
  });

  test("no CDN font/script hosts referenced in src/", () => {
    const all = walk(SRC_DIR, [".ts", ".tsx", ".css"]).map(read).join("\n");
    expect(all).not.toContain("fonts.googleapis");
    expect(all).not.toContain("unpkg.com");
  });
});

// ── README documents the layout ──────────────────────────────────────────────
describe("architecture — README", () => {
  const readme = () => read(resolve(WWW_DIR, "README.md"));
  test("references the component structure and the booking + analytics setup", () => {
    const r = readme();
    for (const s of [
      "src/sections",
      "src/design",
      "src/content",
      "VITE_CALCOM_USERNAME",
      "VITE_PLAUSIBLE_SRC",
    ]) {
      expect(r).toContain(s);
    }
    expect(r.toLowerCase()).toContain("adding a page");
  });
});
