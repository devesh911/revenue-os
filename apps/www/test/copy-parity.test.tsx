// Copy + first-paint spec for the demo-first landing page (v2), asserted on the
// SSR render of <App/> — which is exactly what a visitor sees before any script
// runs or any animation plays. Pins: the buyer-outcome copy, one "Book a demo"
// action, the sample call readable (and its result visible) before playback, the
// honest labelling of examples, and the retired copy staying retired.
//
// App + react-dom/server load via try/catch so a broken tree fails as assertions,
// never as an opaque import crash.
import { beforeAll, describe, expect, test } from "bun:test";
import { type ComponentType, createElement } from "react";

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

// Text content only (tags stripped, entities for & ' " decoded) — copy pins
// shouldn't care which element carries the words.
const text = () =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

test("App renders to static markup", () => {
  expect(appLoaded).toBe(true);
});

describe("copy — the buyer-outcome story", () => {
  const COPY: Array<[string, string]> = [
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
    ["closing", "See how Revenue OS would handle your next property enquiry."],
    [
      "closing sub",
      "Hear a sample call, review the qualification summary, and see how a site visit gets booked.",
    ],
  ];
  for (const [label, needle] of COPY) {
    test(`renders: ${label}`, () => expect(text()).toContain(needle));
  }

  const RETIRED = [
    "Run our pilot",
    "Subscribe and connect",
    "Book a pilot",
    "12,000+",
    "eleven Indian languages",
    "₹60K",
    "The revenue operating system for Indian real",
    // honesty: no live portal intake, no seconds-to-call claim, no absolute promise, no
    // invented plan limit or metric that implies live intake (CSV import only, today)
    "99acres",
    "47 sec",
    "no enquiry goes quiet",
    "Up to 500 leads",
    "Median time to first call",
  ];
  for (const needle of RETIRED) {
    test(`no longer renders: ${needle}`, () =>
      expect(text()).not.toContain(needle));
  }
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

describe("the sample call — useful before playback", () => {
  test("is labelled as a text-to-speech recreation, not the product voice", () => {
    expect(text()).toContain("Sample call");
    expect(text()).toContain("not the voice used on real calls");
  });

  test("has a play control showing the recording's duration", () => {
    expect(markup).toMatch(
      /<button\b(?:(?!<\/button>).)*Play sample call(?:(?!<\/button>).)*<\/button>/s,
    );
    expect(text()).toContain("0:42");
    expect(markup).toMatch(/<audio\b[^>]*src="\/sample-call\.m4a"/);
  });

  test("shows the whole transcript before playback", () => {
    for (const stem of [
      "Namaste Rohan ji",
      "Budget around 90 lakh hai",
      "Saturday, 11 baje theek rahega",
      "Location aur details main WhatsApp par bhej rahi hoon",
    ]) {
      expect(text()).toContain(stem);
    }
  });

  test("shows the result before playback: budget, location, timeline, next action", () => {
    for (const s of [
      "Budget",
      "₹90 L",
      "Location",
      "Whitefield, Bengaluru",
      "Buying timeline",
      "Next action",
      "Site visit, Sat 11:00 AM",
    ]) {
      expect(text()).toContain(s);
    }
  });
});

describe("accessibility + first paint", () => {
  test("faq toggles expose state; exactly one answer open by default", () => {
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-expanded="false"');
    expect((markup.match(/data-open="true"/g) ?? []).length).toBe(1);
  });

  test("landmarks and exactly one h1", () => {
    for (const tag of ["nav", "header", "main", "footer"]) {
      expect(new RegExp(`<${tag}[\\s>]`, "i").test(markup)).toBe(true);
    }
    expect((markup.match(/<h1[\s>]/gi) ?? []).length).toBe(1);
  });

  test("nothing is hidden waiting for a scroll reveal", () => {
    expect(markup).not.toContain("data-reveal");
    expect(markup).not.toMatch(/style="[^"]*opacity:\s*0/);
  });
});
