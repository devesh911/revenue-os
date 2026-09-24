// Architecture spec for the landing page — source-level, env-free (pure fs +
// regex over SOURCE; no imports of app code, no DOM, no build). Pins the editorial
// design system (the paper / ink / clay tokens, self-hosted Lora + IBM Plex Mono,
// the motion floor, the page-wide pause switch, the one-shot scroll reveal), the
// file layout, content separation, "Before the call" reading its four intent
// signals from one module, namespaced keyframes, the demo-booking wiring (one
// "Book a demo" label; the only external host is the booking API, in one file)
// and the README.
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
// Source with whole-line `//` comments and `/* … */` blocks removed, so a pin on
// what the code DOES isn't tripped by prose about it.
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

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

  test("src/main.tsx imports App and the stylesheet, and loads analytics from VITE_PLAUSIBLE_SRC", () => {
    const src = read(resolve(SRC_DIR, "main.tsx"));
    // main.tsx owns the CSS side-effect import, keeping App SSR-safe.
    expect(/from\s+["']\.\/App["']/.test(src)).toBe(true);
    expect(/["']\.\/styles\.css["']/.test(src)).toBe(true);
    expect(src).toMatch(
      /initAnalytics\(\s*import\.meta\.env\.VITE_PLAUSIBLE_SRC/,
    );
  });

  test("src/App.tsx exports App and composes the sections in page order", () => {
    const src = read(resolve(SRC_DIR, "App.tsx"));
    expect(exportsName(src, "App")).toBe(true);
    const ORDER = [
      "BookingProvider",
      "Nav",
      "Hero",
      "Proof",
      "StageGrid",
      "BeforeCall",
      "Moats",
      "Pricing",
      "Faq",
      "FooterCta",
      "BookingDialog",
    ];
    const at = ORDER.map((name) => {
      const hits = src.match(new RegExp(`<${name}[\\s/>]`, "g")) ?? [];
      expect(hits.length, `<${name}> must appear exactly once`).toBe(1);
      return src.search(new RegExp(`<${name}[\\s/>]`));
    });
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });
});

// ── src/styles.css owns the @theme tokens (raw hex lives ONLY here) ──────────
describe("architecture — src/styles.css @theme tokens", () => {
  test("imports tailwind and declares an @theme block", () => {
    const css = read(STYLES);
    expect(css).toContain('@import "tailwindcss"');
    expect(/@theme\b/.test(css)).toBe(true);
  });

  // EXACT palette values (case-insensitive hex) — the warm paper / ink / clay
  // system. Alpha tiers are Tailwind `/<alpha>` modifiers on these, not tokens.
  const TOKENS: Array<[string, string]> = [
    ["paper", "#FAF9F5"],
    ["paper-2", "#F0EEE6"],
    ["line", "#E8E6DC"],
    ["ink", "#141413"],
    ["clay", "#D97757"],
    ["clay-deep", "#A9492A"],
    ["olive", "#788C5D"],
    // the text tiers the ≥4.5:1 contrast floor rests on
    ["ink-2", "#3D3D3A"],
    ["stone", "#6B6A64"],
    ["olive-deep", "#56663F"],
  ];
  for (const [name, hex] of TOKENS) {
    test(`defines --color-${name}: ${hex}`, () => {
      expect(
        new RegExp(`--color-${name}\\s*:\\s*${hex}\\b`, "i").test(read(STYLES)),
      ).toBe(true);
    });
  }

  for (const fam of ["Lora", "IBM Plex Mono"]) {
    test(`declares font family ${fam}`, () => {
      expect(read(STYLES)).toContain(fam);
    });
  }
});

// ── the motion floor, the pause switch and the one-shot scroll reveal ────────
describe("architecture — motion floor, pause switch, scroll reveal", () => {
  test("reduced motion ends every animation and removes the SMIL loops", () => {
    const css = read(STYLES);
    const reduce =
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/.exec(
        css,
      )?.[1] ?? "";
    expect(reduce, "a prefers-reduced-motion: reduce block").not.toBe("");
    expect(reduce).toMatch(/animation-iteration-count:\s*1/);
    expect(reduce).toMatch(/\[data-motion-only\]\s*\{\s*display:\s*none/);
  });

  test("scroll reveal hides content only behind html[data-motion]", () => {
    const css = read(STYLES);
    const hides = [
      ...css.matchAll(/([^{}]*\[data-reveal\][^{}]*)\{[^}]*opacity:\s*0\b/g),
    ];
    expect(hides.length).toBeGreaterThan(0);
    for (const m of hides) expect(m[1]).toContain("html[data-motion]");
    const lib = read(resolve(SRC_DIR, "lib/reveal.ts"));
    expect(exportsName(lib, "reveal")).toBe(true);
    expect(exportsName(lib, "useReveal")).toBe(true);
    expect(read(resolve(SRC_DIR, "App.tsx"))).toMatch(/useReveal\(\)/);
  });

  test("the pause switch (html[data-still]) freezes every CSS animation", () => {
    expect(read(STYLES)).toMatch(
      /html\[data-still\]\s*\*[^{]*\{[^}]*animation-play-state:\s*paused/,
    );
    const lib = read(resolve(SRC_DIR, "lib/motion.ts"));
    for (const name of ["setStill", "useStill", "useLiveSvg"])
      expect(exportsName(lib, name), `lib/motion exports ${name}`).toBe(true);
    const hero = read(resolve(SRC_DIR, "sections/Hero.tsx"));
    expect(hero).toMatch(/setStill\(/);
    expect(hero).toMatch(/from\s+["']\.\.\/content\/site["']/); // the switch's words
  });

  test("every SMIL loop pauses with the switch and drops under reduced motion", () => {
    const smil = sources().filter((f) =>
      /repeatCount\W{1,4}indefinite/.test(read(f)),
    );
    expect(smil.length).toBeGreaterThan(0);
    for (const f of smil) {
      expect(read(f), `${rel(f)} must call useLiveSvg`).toMatch(/useLiveSvg\(/);
      expect(read(f), `${rel(f)} must mark data-motion-only`).toContain(
        "data-motion-only",
      );
    }
  });

  test("the timer-driven demo call holds still when paused", () => {
    const src = read(resolve(SRC_DIR, "visuals/HeroCall.tsx"));
    expect(src).toMatch(/useStill\(\)/);
    expect(src).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  test("the loop runner (lib/sequence) and the live floor plan honour pause and reduced motion", () => {
    for (const file of ["lib/sequence.ts", "visuals/SurveyGround.tsx"]) {
      const src = code(read(resolve(SRC_DIR, file)));
      expect(src, `${file} reads the pause switch`).toMatch(/useStill\(\)/);
      expect(src, `${file} checks reduced motion`).toMatch(
        /prefers-reduced-motion:\s*reduce/,
      );
    }
    expect(
      exportsName(read(resolve(SRC_DIR, "lib/sequence.ts")), "useSequence"),
    ).toBe(true);
  });

  test("the before-the-call studies step through useSequence, with no timers of their own", () => {
    for (const file of [
      "visuals/IntentEvidence.tsx",
      "visuals/CallBrief.tsx",
    ]) {
      const src = code(read(resolve(SRC_DIR, file)));
      expect(src, `${file} uses useSequence`).toMatch(/useSequence\(/);
      expect(src, `${file} runs no timer`).not.toMatch(
        /\b(?:setTimeout|setInterval|requestAnimationFrame)\(/,
      );
    }
  });

  test("the chime is armed at boot and only sounds while the brief plays", () => {
    const lib = read(resolve(SRC_DIR, "lib/chime.ts"));
    for (const name of [
      "chime",
      "armChime",
      "unlockSound",
      "setSound",
      "useSound",
      "useSoundReady",
    ])
      expect(exportsName(lib, name), `lib/chime exports ${name}`).toBe(true);
    expect(code(read(resolve(SRC_DIR, "main.tsx")))).toMatch(/armChime\(\)/);
    const brief = code(read(resolve(SRC_DIR, "visuals/CallBrief.tsx")));
    expect(brief).toMatch(/from\s+["']\.\.\/lib\/chime["']/);
    expect(brief, "chime() only while the sequence is playing").toMatch(
      /\bplaying\s*&&[^;{}]*\bchime\(\)/,
    );
    // The Sound switch reads "on" only once audio can really play, and its own
    // press (a real gesture) unlocks it.
    expect(brief).toMatch(/useSoundReady\(\)/);
    expect(brief).toMatch(/onClick=\{[^}]*\bunlockSound\(\)/);
  });
});

// ── self-hosted fonts: @font-face url()s stay local ─────────────────────────
describe("architecture — @font-face self-hosting in src/styles.css", () => {
  const faceBlocks = (css: string): string[] =>
    [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");

  test("both self-hosted families have @font-face rules", () => {
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
      // url()s in src/styles.css resolve relative to its dir (src/) → ../fonts/<f>.
      expect(existsSync(resolve(SRC_DIR, u)), `must resolve: ${u}`).toBe(true);
    }
  });
});

// ── file layout: design / visuals / sections / lib ───────────────────────────
describe("architecture — component layout", () => {
  const LAYOUT: Array<[string, string[]]> = [
    [
      "design",
      ["Heading", "Text", "Kicker", "MonoLabel", "CtaButton", "SectionFrame"],
    ],
    [
      "visuals",
      [
        "BrandMark",
        "HeroCall",
        "SampleAudio",
        "FunnelFlow",
        "MoatArt",
        "CallArt",
        "BookingDialog",
        "Icon",
        "SurveyGround",
        "IntentEvidence",
        "CallBrief",
      ],
    ],
    [
      "sections",
      [
        "Nav",
        "Hero",
        "Proof",
        "StageGrid",
        "IntentRouting",
        "BeforeCall",
        "Moats",
        "Pricing",
        "Faq",
        "FooterCta",
      ],
    ],
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

  test("CtaButton declares accent + ghost variants", () => {
    const src = read(resolve(SRC_DIR, "design", "CtaButton.tsx"));
    expect(src).toContain("accent");
    expect(src).toContain("ghost");
  });

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

  // The old copy's parking folder and the demo-first redesign's parallel files
  // are gone, so there is one tree and one source for every word.
  const RETIRED = [
    "content/v1",
    "design/Button.tsx",
    "design/Label.tsx",
    "design/Section.tsx",
    "design/Card.tsx",
    "sections/Logos.tsx",
    "sections/HowItWorks.tsx",
    "sections/Examples.tsx",
    "sections/Pilot.tsx",
    "sections/ClosingCta.tsx",
    "visuals/SampleCall.tsx",
  ];
  for (const path of RETIRED) {
    test(`src/${path} does not exist`, () => {
      expect(existsSync(resolve(SRC_DIR, path))).toBe(false);
    });
  }
});

// ── content: typed modules hold the copy; files import it, never inline it ──
describe("architecture — src/content/ holds the copy", () => {
  const CONTENT: Array<[string, string[]]> = [
    ["site", ["Book a demo", "How it works", "Pause animations"]],
    [
      "hero",
      [
        "Turn property enquiries into qualified site visits.",
        "Hear a sample call",
        "/sample-call.m4a",
        "Rohan Mehta",
        "after import",
        "Meridian Greens · Tower B",
        "Balcony",
      ],
    ],
    ["proof", ["Illustrative example", "Enquiries called the same day"]],
    [
      "workflow",
      ["Respond quickly", "Understand the buyer", "Arrange the next step"],
    ],
    ["examples", ["Built around how property sales actually work"]],
    ["pilot", ["Start with a four-week pilot", "How fees work", "Planned"]],
    ["faqs", ["How natural does the voice sound?"]],
    [
      "closing",
      ["See how Revenue\\u00a0OS would handle your next property enquiry."],
    ],
    ["booking", ["Choose a time", "Work email"]],
    [
      "beforeCall",
      [
        "Before the call",
        "Your team answers once. Every call knows.",
        "Illustrative example",
        "Repeat enquiry",
      ],
    ],
    ["intentEvidence", ["Call now", "Follow-up plan", "call-now line"]],
    [
      "callBrief",
      ["Priya Nair", "What the agent looked at", "Open question", "Call plan"],
    ],
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

  test("every content module is used by the page", () => {
    const consumers = sources()
      .filter((f) => !rel(f).startsWith("content/"))
      .map(read)
      .join("\n");
    const mods = walk(resolve(SRC_DIR, "content"), [".ts"]);
    expect(mods.length).toBe(CONTENT.length);
    for (const f of mods) {
      const mod = rel(f).replace(/^content\/|\.ts$/g, "");
      expect(
        new RegExp(`from\\s+["'][^"']*content/${mod}["']`).test(consumers),
        `content/${mod} must be imported by a component`,
      ).toBe(true);
    }
  });

  // [file, content module, strings that MUST live in content — not the file]
  const SEPARATION: Array<[string, string, string[]]> = [
    ["App", "site", ["Skip to content", "Built in India"]],
    ["sections/Nav", "site", ["How it works"]],
    [
      "sections/Hero",
      "hero",
      ["Turn property enquiries", "Voice AI for Indian real estate"],
    ],
    ["sections/Hero", "site", ["Pause animations"]],
    [
      "visuals/SampleAudio",
      "hero",
      ["Hear a sample call", "/sample-call.m4a", "not the voice used"],
    ],
    [
      "visuals/HeroCall",
      "hero",
      [
        "Rohan Mehta",
        "Namaste Rohan",
        "Site visit booked",
        "2 min after import",
      ],
    ],
    [
      "sections/Proof",
      "proof",
      ["What your pilot report shows", "Enquiries called the same day"],
    ],
    ["sections/StageGrid", "workflow", ["From enquiry to site visit"]],
    ["sections/IntentRouting", "workflow", ["Not ready to visit yet?"]],
    ["visuals/FunnelFlow", "workflow", ["New enquiries"]],
    [
      "sections/Moats",
      "examples",
      ["Built around how property sales", "A natural Hinglish conversation"],
    ],
    ["visuals/MoatArt", "examples", ["Kitna hai?", "Weekend pe?"]],
    [
      "sections/Pricing",
      "pilot",
      ["Start with a four-week pilot", "How fees work", "Funnel Engine"],
    ],
    ["sections/Faq", "faqs", ["How natural does the voice sound?"]],
    ["sections/FooterCta", "closing", ["See how Revenue OS would handle"]],
    ["visuals/BookingDialog", "booking", ["Work email", "Choose a time"]],
    ["lib/bookingContext", "site", []],
    [
      "sections/BeforeCall",
      "beforeCall",
      ["Before the call", "Your team answers once", "Illustrative example"],
    ],
    [
      "visuals/IntentEvidence",
      "intentEvidence",
      [
        "Call now",
        "Follow-up plan",
        "call-now line",
        "Needs a home loan",
        "Calling Rohan",
        "Routing",
      ],
    ],
    ["visuals/IntentEvidence", "beforeCall", ["Repeat enquiry", "Budget fits"]],
    [
      "visuals/CallBrief",
      "callBrief",
      [
        "Priya Nair",
        "Call brief",
        "Open question",
        "What the agent looked at",
        "Saved to Meridian Greens",
        "one covered spot",
        "Greet in Hinglish",
        "Ready ·",
      ],
    ],
    ["visuals/CallBrief", "beforeCall", ["Repeat enquiry", "Budget fits"]],
    [
      "visuals/SurveyGround",
      "hero",
      [
        "Meridian Greens",
        "Illustrative",
        "Bed",
        "Balcony",
        "Living",
        "Kitchen",
        "9.75",
        "Visit ·",
      ],
    ],
  ];
  for (const [file, mod, strings] of SEPARATION) {
    test(`${file} imports content/${mod} and inlines none of it`, () => {
      const src = code(read(resolve(SRC_DIR, `${file}.tsx`)));
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
      .filter((f) => code(read(f)).includes("Book a demo"))
      .map(rel);
    expect(holders).toEqual(["content/site.ts"]);
  });
});

// ── "Before the call": the four intent signals are stated once ──────────────
// content/beforeCall.ts holds the signals and their weights and sums them; both
// studies and their copy modules read them from there, so the evidence, the brief
// and the score can never disagree.
describe("architecture — before the call reads one set of signals", () => {
  const BEFORE = read(resolve(SRC_DIR, "content/beforeCall.ts"));
  const WEIGHTS = [...BEFORE.matchAll(/\bweight:\s*(\d+)/g)].map((m) =>
    Number(m[1]),
  );
  const TOTAL = WEIGHTS.reduce((sum, w) => sum + w, 0);

  test("content/beforeCall.ts states four weights and derives the total", () => {
    expect(WEIGHTS.length).toBe(4);
    expect(code(BEFORE)).toMatch(/\btotal:\s*intentSignals\.reduce\(/);
  });

  // A source's string literals, and the rest of its code with them (and its
  // comments) blanked out.
  const split = (src: string) => {
    const strings: string[] = [];
    const rest = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/.*$/gm, "$1")
      .replace(
        /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g,
        (lit) => {
          strings.push(lit);
          return '""';
        },
      );
    return { strings, rest };
  };
  // A weight written as a chip ("+24") or the total as a figure ("78 / 100").
  const RESTATED = new RegExp(
    `\\+\\s*(?:${[...new Set(WEIGHTS)].join("|")})\\b|(?<![\\w.])${TOTAL}(?![\\w.%])`,
  );

  for (const file of [
    "visuals/IntentEvidence.tsx",
    "visuals/CallBrief.tsx",
    "content/intentEvidence.ts",
    "content/callBrief.ts",
  ]) {
    test(`${file} reads intentSignals from content/beforeCall and restates no weight or total`, () => {
      const src = read(resolve(SRC_DIR, file));
      expect(src).toMatch(
        /import\s*\{[^}]*\bintentSignals\b[^}]*\}\s*from\s*["'](?:\.\.\/content\/|\.\/)beforeCall["']/,
      );
      const { strings, rest } = split(src);
      expect(strings.filter((lit) => RESTATED.test(lit))).toEqual([]);
      expect(rest).not.toMatch(/\bweight\s*:\s*\d/);
      expect(rest).not.toMatch(new RegExp(`(?<![\\w.])${TOTAL}(?![\\w.])`));
      expect(rest).not.toMatch(new RegExp(WEIGHTS.join("\\s*,\\s*")));
    });
  }
});

// ── keyframes and utilities are namespaced ──────────────────────────────────
// Shared keyframes are ro-*; each visual that needs its own keeps them (and its
// @utility classes) in its reserved block of styles.css, under its own prefix.
describe("architecture — namespaced keyframes", () => {
  const css = () => read(STYLES);
  const names = (src: string, at: string) =>
    [...src.matchAll(new RegExp(`@${at}\\s+([\\w-]+)`, "g"))].map(
      (m) => m[1] ?? "",
    );
  const used = (src: string) =>
    [...code(src).matchAll(/animate-\[([\w-]+?)_/g)].map((m) => m[1] ?? "");

  test("every @keyframes is ro- (shared) or a visual's own prefix", () => {
    const stray = names(css(), "keyframes").filter(
      (n) => !/^(?:ro|survey|intent|brief)-/.test(n),
    );
    expect(stray).toEqual([]);
  });

  test("every animation a component names is defined in styles.css", () => {
    const defined = new Set(names(css(), "keyframes"));
    const missing = sources().flatMap((f) =>
      used(read(f))
        .filter((n) => !defined.has(n))
        .map((n) => `${rel(f)}: ${n}`),
    );
    expect(missing).toEqual([]);
  });

  // [visual, its styles.css block, its prefix]
  const AREAS: Array<[string, string, string]> = [
    ["visuals/SurveyGround", "hero survey ground", "survey"],
    ["visuals/IntentEvidence", "intent evidence", "intent"],
    ["visuals/CallBrief", "call brief", "brief"],
  ];
  for (const [file, title, prefix] of AREAS) {
    test(`${file}: its keyframes and utilities are ${prefix}-*, in its own block`, () => {
      const all = css();
      const from = all.indexOf(`/* ── ${title} (`);
      expect(from, `styles.css has the "${title}" block`).toBeGreaterThan(0);
      const block = all.slice(from, all.indexOf("/* ── ", from + 1));
      const own = [...names(block, "keyframes"), ...names(block, "utility")];
      for (const n of own)
        expect(n === prefix || n.startsWith(`${prefix}-`), n).toBe(true);
      for (const n of used(read(resolve(SRC_DIR, `${file}.tsx`))))
        expect(n.startsWith("ro-") || n.startsWith(`${prefix}-`), n).toBe(true);
    });
  }
});

// ── raw colour lives ONLY in src/styles.css ─────────────────────────────────
// Components reach colour through the tokens (bg-ink, var(--color-ink), color-mix()
// over them). A hex literal (3, 4, 6 or 8 digits) or a colour function typed out by
// hand — rgb()/rgba()/hsl()/hsla(), or hwb/lab/lch/oklab/oklch() — is a raw colour,
// even inside a Tailwind arbitrary value like shadow-[0_1px_2px_rgba(…)] (so no \b
// before the name: "_" is a word character). color-mix(in oklab, …) only NAMES a
// colour space, with no "(" after it, so it passes.
describe("architecture — raw colour only in src/styles.css", () => {
  const RAW =
    /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|(?<![A-Za-z0-9])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g;

  test("no raw colour hex, rgb() or hsl() in any src/**/*.{ts,tsx}", () => {
    const offenders = sources().flatMap((f) =>
      [...read(f).matchAll(RAW)].map((m) => `${rel(f)}: ${m[0]}`),
    );
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

// ── README documents the layout, the booking + analytics setup ──────────────
describe("architecture — README", () => {
  const readme = () => read(resolve(WWW_DIR, "README.md"));
  test("references the component structure and the booking + analytics setup", () => {
    const r = readme();
    for (const s of [
      "src/sections",
      "src/design",
      "src/content",
      "VITE_CALCOM_USERNAME",
      "VITE_CALCOM_EVENT_SLUG",
      "VITE_PLAUSIBLE_SRC",
    ]) {
      expect(r).toContain(s);
    }
    expect(r.toLowerCase()).toContain("vite");
    expect(r.toLowerCase()).toContain("adding a page");
  });

  test("documents Before the call, the live survey ground and the chime", () => {
    const r = readme();
    for (const s of [
      "Before the call",
      "Illustrative example",
      "content/beforeCall.ts",
      "SurveyGround",
      "lib/sequence.ts",
      "lib/chime.ts",
      "armChime",
    ]) {
      expect(r).toContain(s);
    }
  });
});
