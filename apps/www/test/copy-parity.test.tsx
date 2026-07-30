// RED spec for TASK-34 — www componentization · COPY-PARITY + DEFAULT-STATE.
// The regression net carried from the retired static suite (landing.test.ts
// AC-1/AC-4, structure.test.ts AC-10): the SAME load-bearing copy and the SAME
// default UI state, now asserted against the SSR render of <App/> instead of a
// hand-authored index.html string. Machine tests pin copy + state, never pixels —
// visual parity still needs a human review.
//
// App + react-dom/server load via try/catch so the pre-implementation state fails
// as ASSERTIONS (App undefined → markup === "") and NEVER an opaque import crash.
// react / react-dom resolve from the workspace root. App is imported directly (not
// main.tsx) so it must be SSR-safe — no CSS-import side effects — exactly the
// console's App/main split (main.tsx owns `import "./styles.css"`, App does not).
import { beforeAll, describe, expect, test } from "bun:test";
import { type ComponentType, createElement } from "react";

let markup = "";
let appLoaded = false;

beforeAll(async () => {
  try {
    const server = await import("react-dom/server");
    const mod = (await import("../src/App")) as {
      App?: ComponentType;
      default?: ComponentType;
    };
    const App = mod.App ?? mod.default;
    if (
      typeof App === "function" &&
      typeof server.renderToStaticMarkup === "function"
    ) {
      markup = server.renderToStaticMarkup(createElement(App));
      appLoaded = true;
    }
  } catch {
    markup = "";
    appLoaded = false;
  }
});

describe("copy parity — App SSR carries every load-bearing string", () => {
  test("App exports a component that renders to static markup", () => {
    expect(
      appLoaded,
      "apps/www/src/App must export a React component renderable via renderToStaticMarkup",
    ).toBe(true);
  });

  // Every anchor below was grep-validated against the current index.html export.
  // Apostrophe-free / nbsp-robust stems where the source has curly quotes or nbsp.
  const COPY: Array<[string, string]> = [
    ["hero h1", "The revenue operating system for Indian real"],
    ["hero CTA — run pilot", "RUN OUR PILOT"],
    ["hero CTA — see engine", "SEE THE ENGINE"],
    ["nav CTA — book a pilot", "BOOK A PILOT"],
    ["stage 1 title", "Answer fast"],
    ["stage 2 title", "Score intent"],
    ["stage 3 title", "Qualify"],
    ["stage 4 title", "Book visit"],
    ["low intent label", "LOW INTENT"],
    ["low intent copy", "Nurture loop"],
    ["high intent label", "HIGH INTENT"],
    ["high intent copy", "Human closer, briefed by the machine"],
    ["section head — how it works", "FOUR STAGES RUN ON MACHINE TIME"],
    ["section head — moats", "THREE COMPETITORS, THREE MOATS"],
    ["section head — pricing", "CHOOSE A PLAN TO CONNECT REVENUE OS"],
    ["section head — faq", "ASKED BEFORE EVERY PILOT"],
    ["moat 1 title", "Vertical depth beats breadth"],
    ["moat 2 title", "Built for India, not ported"],
    ["moat 3 title", "The data loop, not the calling"],
    ["plan — pilot", "Pilot"],
    ["plan — funnel engine", "Funnel Engine"],
    ["plan — revenue os", "Revenue OS"],
    ["price — free", "₹0"],
    ["price — 60k", "₹60K"],
    ["price — custom", "Custom"],
    ["faq q1 — TRAI/DND", "Is this compliant with TRAI and DND rules?"],
    ["faq q2 — Hinglish", "Can the agents actually handle Hinglish?"],
    ["faq q3 — telecalling", "Does it replace my telecalling team?"],
    ["faq q4 — outcome pricing", "How does outcome pricing work?"],
    ["faq q5 — pilot involves", "What does the pilot involve?"],
    ["faq TRAI answer", "honors DND registries"],
    ["logo — meridian", "MERIDIAN"],
    ["logo — vastu one", "VASTU ONE"],
    ["logo — griha co", "GRIHA CO."],
    ["logo — northgate", "NORTHGATE"],
    ["logo — anvaya", "ANVAYA"],
    ["guarantee headline a", "Give us one project"],
    ["guarantee headline b", "beat your telecalling team"],
  ];
  for (const [label, needle] of COPY) {
    test(`renders copy: ${label}`, () => {
      expect(markup).toContain(needle);
    });
  }
});

// First opening tag (any element) whose attribute text contains `needle`; "" if
// none. `[^>]*` is bounded by `>`, so a match proves both attrs sit on ONE element.
function openingTagWith(doc: string, needle: string): string {
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`<[a-zA-Z][^>]*${esc}[^>]*>`).exec(doc);
  return m ? m[0] : "";
}

// AC — default state baked into the SSR markup: funnel plan selected, FAQ 0 open.
// Carries landing.test.ts AC-4 forward. The plan-select + accordion are React
// state; their DEFAULT is what renderToStaticMarkup emits. State is exposed via the
// same data hooks the static export used (data-plan/data-selected, data-faq/
// data-open) so the contract is unambiguous for the GREEN rebuild.
describe("default state — funnel selected, faq 0 open (SSR markup)", () => {
  test("funnel plan is selected by default; pilot and os are not", () => {
    const funnel = openingTagWith(markup, 'data-plan="funnel"');
    const pilot = openingTagWith(markup, 'data-plan="pilot"');
    const os = openingTagWith(markup, 'data-plan="os"');
    expect(funnel, 'a [data-plan="funnel"] element must render').not.toBe("");
    expect(pilot, 'a [data-plan="pilot"] element must render').not.toBe("");
    expect(os, 'a [data-plan="os"] element must render').not.toBe("");
    expect(funnel).toContain('data-selected="true"');
    expect(pilot).toContain('data-selected="false"');
    expect(os).toContain('data-selected="false"');
  });

  test('exactly one plan carries data-selected="true"', () => {
    const selected = markup.match(/data-selected="true"/g) ?? [];
    expect(selected.length).toBe(1);
  });

  test("selected + unselected plans show their distinct CTA states", () => {
    // funnel (selected) shows its subscribe CTA; unselected plans show CHOOSE PLAN.
    expect(markup).toContain("SUBSCRIBE AND CONNECT");
    expect(markup).toContain("CHOOSE PLAN");
  });

  test("faq item 0 is open by default; items 1..4 are closed", () => {
    for (let i = 0; i < 5; i++) {
      const tag = openingTagWith(markup, `data-faq="${i}"`);
      expect(tag, `a [data-faq="${i}"] element must render`).not.toBe("");
      expect(tag).toContain(i === 0 ? 'data-open="true"' : 'data-open="false"');
    }
  });

  test("exactly one faq item is open, and item 0's answer is rendered", () => {
    const open = markup.match(/data-open="true"/g) ?? [];
    expect(open.length).toBe(1);
    expect(markup).toContain("honors DND registries");
  });
});

// Carries structure.test.ts AC-9 forward: semantic landmarks + a single h1, now
// asserted on the composed SSR render instead of the hand-authored index.html.
describe("semantic structure — landmarks + single h1 (SSR markup)", () => {
  test("renders header/nav/main/footer landmarks and exactly one h1", () => {
    expect(/<nav[\s>]/i.test(markup), "must render a <nav>").toBe(true);
    expect(/<header[\s>]/i.test(markup), "must render a <header>").toBe(true);
    expect(/<main[\s>]/i.test(markup), "must render a <main>").toBe(true);
    expect(/<footer[\s>]/i.test(markup), "must render a <footer>").toBe(true);
    const h1s = markup.match(/<h1[\s>]/gi) ?? [];
    expect(h1s.length, "exactly one <h1>").toBe(1);
  });
});
