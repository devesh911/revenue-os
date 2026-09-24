// Copy + first-paint spec for the landing page, asserted on the SSR render of
// <App/> — exactly what a visitor sees before any script runs or any animation
// plays. Pins: the buyer-outcome copy, one "Book a demo" action, the hero's
// listen button and its honesty note, the demo call's honest sample lead, the
// hero's drawing sheet and floor plan (drawn and lit), "Before the call" (its
// illustrative tag, both studies' final frame, the running total the score builds
// through, Priya's reply docked in the finished brief, the sound switch), Rohan's
// one evening (import, call, WhatsApp confirmation, visit) told the same in every
// section, the honest labelling of the proof and the plans, a score out of 100 only
// where it is labelled illustrative, the retired copy staying retired, and the
// default UI state and accessible shape (pause switch, FAQ, phone menu).
// Machine tests pin copy + state, never pixels — visual parity needs a human eye.
//
// App + react-dom/server load via try/catch so a broken tree fails as assertions,
// never as an opaque import crash. App is imported directly (not main.tsx), so it
// must stay SSR-safe — main.tsx owns the stylesheet import.
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type ComponentType, createElement } from "react";
import { intentScore, intentSignals } from "../src/content/beforeCall";
import { callBrief } from "../src/content/callBrief";
import { examples } from "../src/content/examples";
import { type CallScenario, calls, sampleCall } from "../src/content/hero";
import { intentEvidence } from "../src/content/intentEvidence";
import { workflow } from "../src/content/workflow";
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
// The hero's drawing sheet: the band's markup before the hero section opens.
const surveyGround = () => {
  const main = markup.indexOf("<main");
  return markup.slice(main, markup.indexOf("<section", main));
};
// The floor plan under the call card, from its root to the figure's end.
const surveyPlan = () => figure().slice(figure().indexOf("data-plot="));
// "Before the call", up to the examples that follow it.
const beforeSection = () => {
  const from = markup.indexOf('id="before-the-call"');
  const to = markup.indexOf('id="examples"');
  return from >= 0 && to > from ? markup.slice(from, to) : "";
};

// ── first-frame visibility ──────────────────────────────────────────────────
// The open tags around each text run in `html` that carries `needle` (the whole
// run when `exact`): its element and every ancestor. Attributes never match.
const VOID = /^(?:area|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function runs(html: string, needle: string, exact = false): string[][] {
  const words = esc(
    needle
      .replace(/&/g, "&amp;")
      .replace(/'/g, "&#x27;")
      .replace(/"/g, "&quot;"),
  )
    .trim()
    .split(/\s+/)
    .join("\\s+");
  const at = new RegExp(exact ? `>\\s*${words}\\s*<` : `>[^<]*?${words}`, "g");
  return [...html.matchAll(at)].map((m) => {
    const open: Array<[string, string]> = [];
    for (const [tag, close, name = ""] of html
      .slice(0, (m.index ?? 0) + 1) // through the ">" that opens the run
      .matchAll(/<(\/?)([a-z][\w-]*)[^>]*>/gi)) {
      if (close) {
        const i = open.map(([n]) => n).lastIndexOf(name);
        if (i >= 0) open.length = i;
      } else if (!VOID.test(name) && !tag.endsWith("/>"))
        open.push([name, tag]);
    }
    return open.map(([, tag]) => tag);
  });
}
// A tag that keeps its content out of view until a later beat: faded out, not
// yet drawn (a zero scale or a clip), or visually hidden.
const HELD =
  /(?:^|\s)(?:opacity-0|invisible|sr-only|\[clip-path:inset\(0_100%_0_0\)\])(?:\s|$)/;
const holds = (tag: string) =>
  HELD.test(/\sclass="([^"]*)"/.exec(tag)?.[1] ?? "") ||
  /\sstyle="[^"]*(?:opacity:\s*0(?![.\d])|scale[XY]?\(0\))/.test(tag);
// On first paint at least one run of `needle` is in view…
function inView(html: string, needle: string, exact = false) {
  const found = runs(html, needle, exact);
  expect(found.length, `"${needle}" renders`).toBeGreaterThan(0);
  expect(
    found.some((tags) => !tags.some(holds)),
    `"${needle}" is in view on first paint`,
  ).toBe(true);
}
// …or every run of it is held back (a beat that belongs before the final frame).
function heldBack(html: string, needle: string, exact = false) {
  const found = runs(html, needle, exact);
  expect(found.length, `"${needle}" renders`).toBeGreaterThan(0);
  expect(
    found.every((tags) => tags.some(holds)),
    `"${needle}" is held back in the final frame`,
  ).toBe(true);
}

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
    // no CRM write-back shown as built (planned); an intent score (also planned)
    // is scoped to the illustrative "Before the call" section, below
    "Written to CRM",
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

describe("the hero's drawing sheet and floor plan — decorative, drawn and lit on first paint", () => {
  test("the sheet's title strip names the flat and says it is illustrative", () => {
    const ground = surveyGround();
    expect(ground).toMatch(/^<main[^>]*><div\b[^>]*><div aria-hidden="true"/);
    inView(ground, "Meridian Greens · Tower B · Typical 2 BHK");
    inView(ground, "Illustrative", true);
  });

  test("the plan sits in the call card's figure, aria-hidden, already drawn", () => {
    const root = /^data-plot="(\w+)"/.exec(surveyPlan())?.[1];
    expect(root, "the plan renders inside the figure").toBe("done");
    const tag = /<div\b[^>]*data-plot="done"[^>]*>/.exec(figure())?.[0] ?? "";
    expect(tag).toContain('aria-hidden="true"');
    expect(tag).not.toMatch(/\srole=/);
  });

  test("the finished call has lit it: the rooms, the width, the budget tag, the visit pin", () => {
    for (const s of [
      "Bed 1",
      "Balcony",
      "Bed 2",
      "Living",
      "Kitchen",
      "9.75 m",
      "₹90 L",
      "Visit · Sat 11:00 AM",
    ])
      inView(surveyPlan(), s, true);
  });
});

describe("before the call — illustrative, its final frame on first paint", () => {
  const section = beforeSection;
  // The head: everything before the first study.
  const head = () => section().slice(0, section().indexOf('role="img"'));

  test("sits after How it works and before the examples", () => {
    const at = ['id="how"', 'id="before-the-call"', 'id="examples"'].map((s) =>
      markup.indexOf(s),
    );
    expect(at.every((i) => i > 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  test("the head: kicker, the heading that labels the section, the sub, the tag", () => {
    const t = textOf(head());
    expect(t).toContain("Before the call");
    expect(t).toContain(
      "When a buyer asks something the brochure doesn't cover, Revenue OS asks your sales team, saves the answer to the project, and every call after that gets it right.",
    );
    const id = /^id="before-the-call" aria-labelledby="([^"]+)"/.exec(
      section(),
    )?.[1];
    expect(id, "the section is labelled by its heading").toBeDefined();
    expect(head()).toMatch(
      new RegExp(
        `<h2\\b[^>]*id="${id}"[^>]*>Your team answers once\\. Every call knows\\.</h2>`,
      ),
    );
    inView(head(), "Illustrative example", true);
    for (const tags of runs(head(), "Illustrative example"))
      for (const tag of tags) expect(tag).not.toContain("aria-hidden");
  });

  test("why he's high intent: one labelled image that tells the story once", () => {
    const img = /<div\b[^>]*\brole="img" aria-label="([^"]*)"/.exec(section());
    const label = decode(img?.[1] ?? "");
    expect(label).toStartWith(
      "Illustrative: why Rohan Mehta is a high-intent buyer.",
    );
    for (const s of [
      "repeat enquiry, plus 24",
      "budget fits, plus 22",
      "timeline known, plus 16",
      "asked about possession before, plus 16",
      "Needing a home loan is context for the call, not a minus.",
      "The total is 78 out of 100, above the call-now line at 50",
      "the follow-up plan instead",
    ])
      expect(label).toContain(s);
  });

  const SIGNALS: Array<[string, string]> = [
    ["Repeat enquiry", "+24"],
    ["Budget fits", "+22"],
    ["Timeline known", "+16"],
    ["Asked about possession before", "+16"],
  ];

  test("why he's high intent, final frame: four signals with weights, 78 / 100, call now", () => {
    const study = section().slice(
      section().indexOf('role="img"'),
      section().indexOf('class="sr-only"'),
    );
    for (const [signal, weight] of SIGNALS) {
      inView(study, signal, true);
      inView(study, weight, true);
    }
    for (const s of [
      "Needs a home loan",
      "context, not a minus",
      "Call now",
      "Tonight, in Hinglish, with the brief in hand",
      "Calling Rohan · 7:14 PM",
      "Follow-up plan",
      "High",
      "78",
      "/ 100",
    ])
      inView(study, s, true);
    const t = textOf(study);
    expect(t).toContain("50 · call-now line");
    expect(t).toContain(
      "50 and over gets a call tonight. Under 50 gets the follow-up plan. Weights and the line are examples.",
    );
    expect(t).toContain("WhatsApp brochure today, re-call in 5 days");
    // the caption on show is the route, not the opening line
    inView(study, "Calling him now, in Hinglish, at 7:14 PM.");
    heldBack(study, "Before I call, I'll weigh what I found about Rohan.");
    expect(study, "every bar is drawn").not.toMatch(/scale[XY]\(0\)/);
  });

  test("the call brief tells a screen reader the story once, Priya's reply included", () => {
    const summary = textOf(
      /<p class="sr-only">(?:(?!<\/p>).)*<\/p>/s.exec(section())?.[0] ?? "",
    );
    for (const s of [
      "A call brief for Rohan Mehta writes itself before the call",
      "the agent asks Priya Nair, the sales manager, on WhatsApp",
      'She replies: "Yes — one covered spot. Floor rise is extra above the 10th floor."',
      "saved to the Meridian Greens facts",
      "Repeat enquiry +24, Budget fits +22, Timeline known +16, Asked about possession before +16: intent 78 out of 100, high.",
      "the agent calls Rohan at 7:14 PM in Hinglish",
    ])
      expect(summary).toContain(s);
  });

  test("the call brief, final frame: the facts, the saved answer, the score, the plan, Ready", () => {
    const brief = section().slice(section().indexOf('class="sr-only"'));
    for (const s of [
      "Rohan Mehta",
      "2 BHK in Whitefield, budget up to ₹90 L",
      "Meridian Greens · Tower B",
      "Second enquiry this month",
      "Hinglish · evenings",
      // the open question, answered by Priya and saved to the project
      "One covered car park included",
      "Floor rise is extra above the 10th floor",
      "from Priya · 7:13 PM",
      "Saved to Meridian Greens facts",
      // the intent row and the rail's sum
      "78 / 100",
      "= 78 / 100",
      "4 signals · over 50 means call now",
      // the call plan
      "Call plan",
      "6 steps · Hinglish",
      "Greet in Hinglish",
      "Confirm 2 BHK, Whitefield, ₹90 L",
      "Possession: December 2027",
      "Covered car park included",
      "from Priya",
      "Offer a Saturday site visit",
      "Offer the home\u2011loan partner",
      // ready, and calling
      "Ready",
      "Ready · calling 7:14 PM",
      "Calling in Hinglish · 0:0",
      "Brief ready. Calling Rohan at 7:14 PM, in Hinglish.",
    ])
      inView(brief, s, true);
    for (const [signal, weight] of SIGNALS) {
      inView(brief, signal, true);
      inView(brief, weight, true);
    }
    expect(textOf(brief)).toContain("What the agent looked at");
    // both meters stand at the score: 78 of 100
    expect(brief.match(/transform:scaleX\(0\.78\)/g)?.length).toBe(2);
    // the beats before the final frame are held back
    for (const s of [
      "Preparing",
      "Asking Priya Nair on WhatsApp…",
      "not in brochure",
      "The call waits for the brief",
    ])
      heldBack(brief, s, true);
    heldBack(brief, "Rohan Mehta, from tonight's import.");
  });

  test("the score builds from the signals: a running total 24, 46, 62, 78, then = 78 / 100", () => {
    const brief = section().slice(section().indexOf('class="sr-only"'));
    const running = intentSignals.map((_, i) =>
      intentSignals.slice(0, i + 1).reduce((sum, s) => sum + s.weight, 0),
    );
    expect(running).toEqual([24, 46, 62, 78]);
    expect(running.at(-1)).toBe(intentScore.total);
    const score = `${intentScore.total} / ${intentScore.outOf}`;
    // Each calculation stacks its figures in one cell: every running total, then
    // the sum ("= 78 / 100" under the rail's signals from 720px, "78 / 100" in the
    // Intent row that adds them up itself on phones). The final frame shows the
    // sum alone; the totals before it have risen away, so none overlaps it.
    for (const sum of [`= ${score}`, score]) {
      const stack = new RegExp(
        [...running, sum]
          .map((v) => `(<span\\b[^>]*>)${esc(`${v}`)}</span>`)
          .join(""),
      ).exec(brief);
      expect(stack, `the running totals, then "${sum}"`).not.toBeNull();
      expect(stack?.slice(1).map(holds)).toEqual([
        ...running.map(() => true),
        false,
      ]);
      inView(brief, sum, true);
    }
  });

  test("Priya's reply stays docked in the finished brief; her pop-up has gone", () => {
    const brief = section().slice(section().indexOf('class="sr-only"'));
    const found = runs(brief, callBrief.priya.reply, true);
    // her pop-up is the floating card (.brief-float) that covers the brief while
    // she replies; the docked copies sit under her rail source (from 720px) and
    // under the caption bar (phones), where her name goes with it
    const popup = (tags: string[]) =>
      tags.some((t) => t.includes("brief-float"));
    const docked = found.filter((tags) => !popup(tags));
    const popups = found.filter(popup);
    expect(docked.length, "docked from 720px and on phones").toBe(2);
    for (const tags of docked)
      expect(tags.some(holds), "docked, in view").toBe(false);
    expect(popups.length, "the pop-up renders, to pop in").toBeGreaterThan(0);
    for (const tags of popups)
      expect(tags.some(holds), "pop-up gone").toBe(true);
    inView(brief, callBrief.priya.name, true);
  });

  test("Priya's WhatsApp reply is on the page, quoting the question it answers", () => {
    const t = textOf(section());
    for (const s of [
      "Priya Nair",
      "Sales manager · WhatsApp",
      "Is one covered car park included in the ₹88 L price?",
      "Yes — one covered spot. Floor rise is extra above the 10th floor.",
    ])
      expect(t).toContain(s);
  });

  test("the sound switch is a real button with aria-pressed, off until audio can play", () => {
    const buttons =
      section().match(
        /<button\b[^>]*aria-pressed="(?:true|false)"[^>]*>(?:(?!<\/button>).)*Sound(?:(?!<\/button>).)*<\/button>/gs,
      ) ?? [];
    expect(buttons.length).toBe(1);
    const tag = /<button\b[^>]*>/.exec(buttons[0] ?? "")?.[0] ?? "";
    expect(tag).toContain('type="button"');
    expect(tag).toContain('aria-pressed="false"');
    expect(tag).toContain("min-h-[44px]");
    for (const tags of runs(section(), "Sound", true))
      for (const t of tags) expect(t).not.toContain('aria-hidden="true"');
  });
});

// ── Rohan's evening: one timeline, told the same in every section ──────────
// The hero's lead is the anchor; every other time is read from the content
// modules and checked against it, so a section can't drift to its own story.
// A clock reading ("7:12 PM", "7:13:40 PM", "Thu 7:16 PM") in seconds after midnight…
const clock = (s: string) => {
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP])M/.exec(s);
  expect(m, `"${s}" holds a time`).not.toBeNull();
  const [, h = "0", min = "0", sec = "0", half] = m ?? [];
  return (
    ((Number(h) % 12) + (half === "P" ? 12 : 0)) * 3600 +
    Number(min) * 60 +
    Number(sec)
  );
};
// …and back, to the minute: "7:14 PM". Whitespace (a no-break space) reads as one space.
const toClock = (t: number) => {
  const h = Math.floor(t / 3600) % 24;
  const min = String(Math.floor(t / 60) % 60).padStart(2, "0");
  return `${h % 12 || 12}:${min} ${h < 12 ? "AM" : "PM"}`;
};
const oneSpace = (s: string) => s.replace(/\s+/g, " ");

describe("Rohan's timeline — one evening, the same in every section", () => {
  const rohan = calls[0] as CallScenario;
  const imported = rohan.time;
  const after = Number(/(\d+)\s*min\b/.exec(rohan.calledAfter)?.[1]);
  const called = toClock(clock(imported) + after * 60);
  const between = (s: string) => {
    expect(clock(s), `${s} is after the import`).toBeGreaterThanOrEqual(
      clock(imported),
    );
    expect(clock(s), `${s} is before the call`).toBeLessThan(clock(called));
  };

  test("the hero's first call: New lead · 7:12 PM, called 2 min after import", () => {
    expect(rohan.lead).toBe("Rohan Mehta");
    expect(imported).toBe("7:12 PM"); // the story's anchor
    expect(called).toBe("7:14 PM");
    inView(figure(), `New lead · ${imported}`, true);
  });

  test("How it works imports him at the same minute, and calls as soon after", () => {
    const [first] = workflow.steps;
    expect(first.example.time).toBe(imported);
    expect(`${first.example.delay} ${first.example.after}`).toBe(
      rohan.calledAfter,
    );
    const how = textOf(
      markup.slice(
        markup.indexOf('id="how"'),
        markup.indexOf('id="before-the-call"'),
      ),
    );
    expect(how).toContain(`${first.example.label} · ${imported}`);
  });

  test("Before the call: imported 7:12 PM, called 7:14 PM, the brief written in between", () => {
    const section = textOf(beforeSection());
    // the import, as the brief's card and its first source state it
    const at = /imported\s+(.+)$/.exec(callBrief.card.sub)?.[1] ?? "";
    expect(oneSpace(at)).toBe(imported);
    expect(oneSpace(callBrief.rail.items[0]?.detail ?? "")).toEndWith(imported);
    expect(section).toContain(oneSpace(callBrief.card.sub));
    // the call, everywhere the section names it
    for (const s of [
      callBrief.footer.stamp,
      callBrief.captions.at(-1)?.text ?? "",
      intentEvidence.callNow.chip,
      intentEvidence.captions.route,
    ])
      expect(oneSpace(s)).toContain(called);
    for (const s of [callBrief.footer.stamp, intentEvidence.callNow.chip])
      expect(section).toContain(oneSpace(s));
    // every beat of the brief lands in order, between the two
    const beats = callBrief.captions.map((c) => clock(c.time));
    expect(beats).toEqual([...beats].sort((a, b) => a - b));
    for (const s of [
      ...callBrief.captions.map((c) => c.time),
      callBrief.priya.time,
      callBrief.question.source,
      callBrief.intent.source,
      intentEvidence.story.time,
    ])
      between(s);
  });

  test("the WhatsApp confirmation follows the call the same evening: Thu 7:16 PM", () => {
    const [confirmation] = examples.visit.messages;
    expect(oneSpace(confirmation.time)).toBe("Thu 7:16 PM");
    expect(
      clock(confirmation.time),
      "sent once the call has ended",
    ).toBeGreaterThan(clock(called) + rohan.seconds);
    const shown = textOf(
      markup.slice(
        markup.indexOf('id="examples"'),
        markup.indexOf('id="pilot"'),
      ),
    );
    expect(shown).toContain(oneSpace(confirmation.time));
  });

  test("the visit it books is one slot everywhere: Saturday, 11:00 AM", () => {
    const slot = /Sat,?\s+(\d{1,2}:\d{2}\s[AP]M)/.exec(
      rohan.outcome.detail,
    )?.[1];
    expect(oneSpace(slot ?? "")).toBe("11:00 AM");
    const visits = [
      ...text().matchAll(
        /\bSat(?:urday)?\b,?\s+(?:at\s+)?(\d{1,2}:\d{2}\s[AP]M)/g,
      ),
    ].map((m) => m[1]);
    // the call card, the plan's pin, How it works, the summary, the confirmation
    expect(visits.length).toBeGreaterThanOrEqual(5);
    expect(new Set(visits)).toEqual(new Set([oneSpace(slot ?? "")]));
  });
});

describe("a score out of 100 — only where it is labelled illustrative", () => {
  const SCORE = /\/\s*100\b|\b\d{1,3}\s+(?:out\s+)?of\s+100\b/;

  test('appears in "Before the call", whose head carries "Illustrative example"', () => {
    const section = beforeSection();
    expect(textOf(section)).toMatch(SCORE);
    const head = section.slice(0, section.indexOf('role="img"'));
    expect(textOf(head)).toContain("Illustrative example");
  });

  test("appears nowhere else: not the hero, the engine, the examples or the pilot", () => {
    const outside = markup.replace(beforeSection(), "");
    expect(outside.length).toBeLessThan(markup.length);
    expect(textOf(outside)).not.toMatch(SCORE);
    expect(decode(outside)).not.toMatch(SCORE);
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
