// Copy + first-paint spec for the landing page, asserted on the SSR render of
// <App/> — exactly what a visitor sees before any script runs or any animation
// plays. Pins: the buyer-outcome copy, one "Book a demo" action, the hero's
// listen button and its honesty note, the demo call's honest sample lead, the
// honest labelling of the proof and the plans, the retired copy staying retired,
// and the default UI state and accessible shape (pause switch, FAQ, phone menu).
// Machine tests pin copy + state, never pixels — visual parity needs a human eye.
//
// App + react-dom/server load via try/catch so a broken tree fails as assertions,
// never as an opaque import crash. App is imported directly (not main.tsx), so it
// must stay SSR-safe — main.tsx owns the stylesheet import.
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type ComponentType, createElement } from "react";
import { sampleCall } from "../src/content/hero";
import { CHECK } from "../src/visuals/Icon";

let markup = "";
let appLoaded = false;

beforeAll(async () => {
  try {
    const server = await import("react-dom/server");
    const mod = (await import("../src/App")) as { App?: ComponentType };
    if (typeof mod.App === "function") {
      markup = server.renderToStaticMarkup(createElement(mod.App));
      appLoaded = true;
    }
  } catch (err) {
    console.error(err);
  }
});

const decode = (s: string) =>
  s
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
// Text content only (tags stripped, entities decoded) — copy pins shouldn't care
// which element carries the words.
const textOf = (html: string) =>
  decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
const text = () => textOf(markup);
// The hero's demo call: the page's one <figure> (the card, the pause switch, the caption).
const figure = () => /<figure\b[\s\S]*?<\/figure>/.exec(markup)?.[0] ?? "";
// The pilot section, up to the FAQ that follows it.
const pilotSection = () =>
  markup.slice(markup.indexOf('id="pilot"'), markup.indexOf('id="faq"'));
// Every <li> whose own content carries `needle`.
const itemsWith = (html: string, needle: string) =>
  [...html.matchAll(/<li\b(?:(?!<\/li>).)*<\/li>/gs)]
    .map((m) => m[0])
    .filter((li) => textOf(li).includes(needle));

test("App renders to static markup", () => {
  expect(appLoaded).toBe(true);
});

describe("copy — the buyer-outcome story", () => {
  const COPY: Array<[string, string]> = [
    ["nav link", "How it works"],
    ["hero eyebrow", "Voice AI for Indian real estate"],
    ["hero headline", "Turn property enquiries into qualified site visits."],
    [
      "hero sub",
      "Revenue OS calls new leads in Hinglish, qualifies budget and timeline, and follows up on WhatsApp",
    ],
    ["hero secondary", "Hear a sample call"],
    ["proof badge", "Illustrative example"],
    ["proof title", "What your pilot report shows"],
    ["proof metric", "Enquiries called the same day"],
    ["how it works", "From enquiry to site visit"],
    ["step 1", "Respond quickly"],
    ["step 1 body", "Call a new enquiry."],
    ["step 2", "Understand the buyer"],
    ["step 2 body", "Capture budget, location, and timeline."],
    ["step 3", "Arrange the next step"],
    ["step 3 body", "Book a visit or continue following up."],
    ["follow-up branch", "Not ready to visit yet?"],
    ["examples heading", "Built around how property sales actually work"],
    ["example 1", "A natural Hinglish conversation"],
    ["example 2", "A summary your salesperson can use"],
    ["example 3", "Site-visit confirmation and follow-up"],
    ["pilot", "Start with a four-week pilot"],
    ["pilot — who", "Who it suits"],
    ["pilot — measured", "How success is measured"],
    ["pilot — fees", "How fees work"],
    ["plans are secondary", "Compare plans"],
    ["faq — voice", "How natural does the voice sound?"],
    ["faq — team", "Does it replace my sales team?"],
    ["faq — integrations", "Which tools does it work with?"],
    ["faq — onboarding", "How long does onboarding take?"],
    ["faq — pricing", "How does pricing work?"],
    ["faq — do-not-call", "How are do-not-call rules handled?"],
    ["closing", "See how Revenue OS would handle your next property enquiry."],
    [
      "closing sub",
      "Hear a sample call, review the qualification summary, and see how a site visit gets booked.",
    ],
  ];
  for (const [label, needle] of COPY) {
    test(`renders: ${label}`, () => expect(text()).toContain(needle));
  }

  // Checked against the visible text AND the attributes (aria-labels speak too).
  const RETIRED = [
    "Run our pilot",
    "Subscribe and connect",
    "Book a pilot",
    "12,000+",
    "eleven Indian languages",
    "₹60K",
    "₹0",
    "The revenue operating system for Indian real",
    // honesty: no live portal intake, no seconds-to-call claim, no absolute promise, no
    // invented plan limit or metric that implies live intake (CSV import only, today)
    "99acres",
    "MagicBricks",
    "47 sec",
    "Called in",
    "no enquiry goes quiet",
    "Up to 500 leads",
    "Median time to first call",
    // no CRM write-back or intent score shown as built (both are planned)
    "Written to CRM",
    "/100",
    // the previous design's old copy stays gone now its layout is back
    "See the engine",
    "MERIDIAN",
    "VASTU ONE",
    "GRIHA CO.",
    "NORTHGATE",
    "ANVAYA",
    "Four stages run on machine time",
    "HIGH INTENT",
    "Three competitors, three moats",
    "Choose a plan to connect Revenue OS",
    "Choose plan",
    "Subscribe",
    "Asked before every pilot",
    "Give us one project",
  ];
  for (const needle of RETIRED) {
    test(`no longer renders: ${needle}`, () => {
      expect(text()).not.toContain(needle);
      expect(decode(markup)).not.toContain(needle);
    });
  }

  test("no seconds-to-call claim anywhere", () => {
    expect(text()).not.toMatch(/\b\d+\s*(?:sec|secs|seconds)\b/i);
  });

  test("languages: Hinglish, Hindi and English only", () => {
    expect(text()).not.toMatch(
      /\b(?:Tamil|Telugu|Kannada|Marathi|Bengali|Bangla|Gujarati|Malayalam|Punjabi|Odia)\b/,
    );
  });
});

describe("one primary action — Book a demo", () => {
  test("appears on at least four primary buttons (nav, hero, pilot, closing)", () => {
    const buttons =
      markup.match(
        /<button\b[^>]*>(?:(?!<\/button>).)*Book a demo(?:(?!<\/button>).)*<\/button>/gs,
      ) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });

  test("is never a plain link to another section", () => {
    expect(markup).not.toMatch(
      /<a\b[^>]*>(?:(?!<\/a>).)*Book a demo(?:(?!<\/a>).)*<\/a>/s,
    );
  });

  test("the booking dialog is on the page, labelled, and closed on first paint", () => {
    const dialog = /<dialog\b[^>]*>/.exec(markup)?.[0] ?? "";
    expect(dialog, "a <dialog> must render").not.toBe("");
    expect(dialog).toMatch(/aria-labelledby="[^"]+"/);
    expect(dialog).not.toMatch(/\sopen(?:=|\s|>)/);
  });
});

describe("the hero's listen button — the sample recording, played in place", () => {
  test('a button reads "Hear a sample call" with the recording\'s 0:42 length', () => {
    expect(markup).toMatch(
      /<button\b(?:(?!<\/button>).)*Hear a sample call(?:(?!<\/button>).)*0:42(?:(?!<\/button>).)*<\/button>/s,
    );
    // its other states' labels hold the pill's width, invisible until they apply
    const label = /<span class="([^"]*)">Hear a sample call<\/span>/.exec(
      markup,
    );
    expect(label?.[1], "the idle label renders").toBeDefined();
    expect(label?.[1]).not.toContain("invisible");
  });

  test("says what the recording is, visibly, right beside it", () => {
    const note =
      /<p\b([^>]*)>(?:(?!<\/p>).)*Recreated with basic text-to-speech, not the voice used on real calls\. Names and figures are illustrative\./s.exec(
        markup,
      );
    expect(note, "the disclosure renders").not.toBeNull();
    expect(note?.[1]).not.toMatch(/sr-only|\bhidden\b|invisible|aria-hidden/);
    // …and screen readers hear it with the button it qualifies
    const id =
      /<p\b[^>]*\bid="([^"]+)"[^>]*>(?:(?!<\/p>).)*Recreated with basic text-to-speech/s.exec(
        markup,
      )?.[1];
    expect(id, "the disclosure has an id").toBeDefined();
    expect(markup).toContain(`aria-describedby="${id}"`);
  });

  test("nothing is fetched on first paint; a load failure has a live region", () => {
    expect(markup).not.toContain("<audio");
    expect(markup).not.toContain("sample-call.m4a");
    expect(markup).toContain('role="status"');
    expect(text()).not.toContain(sampleCall.unavailable);
  });

  test("plays /sample-call.m4a, whose real length is the 0:42 shown", () => {
    expect(sampleCall.src).toBe("/sample-call.m4a");
    expect(sampleCall.seconds).toBe(42);
    const file = resolve(import.meta.dir, "../public/sample-call.m4a");
    expect(existsSync(file), "public/sample-call.m4a must exist").toBe(true);
    // The MP4 movie header (mvhd) holds the timescale and duration.
    const buf = readFileSync(file);
    const i = buf.indexOf("mvhd");
    expect(i).toBeGreaterThan(0);
    const v1 = buf[i + 4] === 1;
    const scale = buf.readUInt32BE(i + (v1 ? 24 : 16));
    const units = v1
      ? Number(buf.readBigUInt64BE(i + 28))
      : buf.readUInt32BE(i + 20);
    expect(Math.abs(units / scale - sampleCall.seconds)).toBeLessThan(1);
  });
});

describe("the hero demo call — the honest sample lead", () => {
  test("is a single labelled image that describes the flow honestly", () => {
    const img = /<[a-z]+\b[^>]*role="img"[^>]*>/.exec(figure())?.[0] ?? "";
    const label = decode(/aria-label="([^"]*)"/.exec(img)?.[1] ?? "");
    expect(label.length).toBeGreaterThanOrEqual(20);
    expect(label).toContain("after import");
    expect(label).toContain("Hinglish");
  });

  test("first paint is the sample call, finished: Rohan Mehta, called 2 min after import, visit booked", () => {
    const t = textOf(figure());
    for (const s of [
      "Rohan Mehta",
      "Called 2 min after import",
      "Imported enquiry · 2 BHK · Whitefield",
      "Namaste Rohan ji",
      "Budget around 90 lakh hai",
      "Saturday, 11 baje theek rahega",
      "Budget ₹90 L",
      "Ready to visit",
      "Site visit booked",
      "Ended 00:42",
    ]) {
      expect(t).toContain(s);
    }
  });

  test("names no lead portal and shows no score as a number", () => {
    const all = `${textOf(figure())} ${decode(figure())}`;
    expect(all).not.toMatch(
      /99\s?acres|magic\s?bricks|housing\.com|nobroker|proptiger|commonfloor|square\s?yards/i,
    );
    expect(textOf(figure())).not.toMatch(/\b\d{1,3}\s*\/\s*100\b/);
  });

  test("a control can pause every animation (WCAG 2.2.2)", () => {
    expect(figure()).toMatch(
      /<button\b(?:(?!<\/button>).)*Pause animations(?:(?!<\/button>).)*<\/button>/s,
    );
  });
});

describe("proof — an example, never a customer result", () => {
  test("is labelled as an illustrative example throughout", () => {
    for (const s of [
      "Illustrative example",
      "Example project:",
      "Current process (example)",
      "Revenue OS (example)",
      "The figures are illustrative, not customer results.",
    ]) {
      expect(text()).toContain(s);
    }
  });

  test("carries no quotation or testimonial", () => {
    expect(markup).not.toMatch(/<(?:blockquote|q|cite)\b/);
  });
});

describe("pilot — built vs planned, no rates", () => {
  test('three plans, the last one "Custom", none with a price figure', () => {
    const t = textOf(pilotSection());
    for (const s of [
      "Pilot",
      "Funnel Engine",
      "Custom",
      "Agreed per engagement",
    ])
      expect(t).toContain(s);
    expect(t).not.toMatch(/₹|\$|\d+\s*(?:K|k|L|lakh)\b|\/\s*(?:mo|month)\b/);
    expect(text()).toContain("Rates are agreed per project");
  });

  test("a check marks only what exists; roadmap items sit under Planned, unchecked", () => {
    const section = pilotSection();
    expect(textOf(section)).toContain("Planned");
    const check = `d="${CHECK}"`;
    for (const built of [
      "Voice calls and WhatsApp follow-ups",
      "Qualification summaries for your team",
      "Pay per qualified site visit",
    ]) {
      const items = itemsWith(section, built);
      expect(items.length, `"${built}" renders`).toBeGreaterThan(0);
      for (const li of items) expect(li).toContain(check);
    }
    for (const planned of [
      "CRM connectors",
      "Intent scoring",
      "Loan handoff",
      "Possession servicing",
      "Documentation workflows",
    ]) {
      const items = itemsWith(section, planned);
      expect(items.length, `"${planned}" renders`).toBeGreaterThan(0);
      for (const li of items) expect(li).not.toContain(check);
    }
  });

  test("plans are a closed disclosure with nothing to select", () => {
    expect(markup).toMatch(
      /<button\b[^>]*aria-expanded="false"[^>]*>Compare plans/,
    );
    expect(markup).not.toMatch(/data-plan=|data-selected=|type="radio"/);
  });
});

describe("accessibility + first paint", () => {
  test("faq: six items, item 0 open by default, the rest closed", () => {
    const items = [...markup.matchAll(/<[a-z]+\b[^>]*data-faq="(\d+)"[^>]*>/g)];
    expect(items.length).toBe(6);
    for (const [tag, i] of items)
      expect(tag).toContain(
        i === "0" ? 'data-open="true"' : 'data-open="false"',
      );
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-expanded="false"');
    expect(text()).toContain("not the voice used on real calls. On the demo");
  });

  test("landmarks and exactly one h1 — the hero headline", () => {
    for (const tag of ["nav", "header", "main", "footer"]) {
      expect(new RegExp(`<${tag}[\\s>]`, "i").test(markup)).toBe(true);
    }
    const h1s = markup.match(/<h1[\s>](?:(?!<\/h1>).)*<\/h1>/gs) ?? [];
    expect(h1s.length).toBe(1);
    expect(textOf(h1s[0] ?? "")).toContain(
      "Turn property enquiries into qualified site visits.",
    );
  });

  test("the phone menu starts closed, names its toggle, and lists every section", () => {
    expect(markup).toMatch(
      /<button\b[^>]*aria-expanded="false"[^>]*aria-controls="nav-menu"[^>]*aria-label="Menu"/,
    );
    const menu = /<ul id="nav-menu"[^>]*>(?:(?!<\/ul>).)*<\/ul>/s.exec(markup);
    expect(menu?.[0], "the menu renders").toMatch(/^<ul id="nav-menu" hidden/);
    const LINKS: Array<[string, string]> = [
      ["How it works", "how"],
      ["Examples", "examples"],
      ["Pilot", "pilot"],
      ["FAQ", "faq"],
    ];
    for (const [label, id] of LINKS) {
      expect(menu?.[0]).toContain(`href="#${id}"`);
      expect(textOf(menu?.[0] ?? "")).toContain(label);
      expect(markup, `the #${id} target exists`).toContain(` id="${id}"`);
    }
  });

  test("nothing is hidden by an inline style on first paint", () => {
    expect(markup).not.toMatch(/style="[^"]*opacity:\s*0/);
  });
});
