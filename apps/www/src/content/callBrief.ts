// The call brief study (visuals/CallBrief.tsx): Rohan Mehta's brief writing itself
// between import (7:12 PM) and the call (7:14 PM) — the agent's running captions,
// the sources it read, each fact with where it came from, the one question the
// brochure can't answer (put to Priya Nair in sales on WhatsApp), the intent score
// built from beforeCall.ts's signals, the six-step call plan and the call itself.
// The score and its signals are READ from beforeCall.ts, never restated, so this
// study and IntentEvidence always agree. Illustrative (the section says so).
// \u00a0 keeps a number with its unit; \u2011 is a non-breaking hyphen.
import { intentScore, intentSignals } from "./beforeCall";

const { total, outOf, callNow } = intentScore;
const score = `${total} / ${outOf}`;
const signals = `${intentSignals.length} signals`;
const ask = "Is one covered car park included in the ₹88\u00a0L price?";
// the same question, as the brief notes it
const open = "Is one covered car park included in ₹88\u00a0L?";
const reply =
  "Yes — one covered spot. Floor rise is extra above the 10th floor.";

export interface BriefRow {
  label: string;
  value: string;
  note: string;
  quote?: boolean; // the note is the buyer's own words, set in serif italic
  source: string;
}

const rows: BriefRow[] = [
  {
    label: "Enquiry",
    value: "2\u00a0BHK in Whitefield, budget up to ₹90\u00a0L",
    note: "\u201c2bhk chahiye whitefield, budget 90 tak, loan bhi lena hai\u201d",
    quote: true,
    source: "from import",
  },
  {
    label: "Project match",
    value: "Meridian Greens · Tower B",
    note: "3 units of 2\u00a0BHK under ₹90\u00a0L · possession Dec\u00a02027",
    source: "inventory sheet",
  },
  {
    label: "History",
    value: "Second enquiry this month",
    note: "2\u00a0Sep: asked about possession · no open follow\u2011up",
    source: "enquiry history",
  },
  {
    label: "Language & time",
    value: "Hinglish · evenings",
    note: "From his note; he enquired at 7:12\u00a0PM",
    source: "from his note",
  },
];

export const callBrief = {
  summary: `A call brief for Rohan Mehta writes itself before the call: his enquiry for a 2\u00a0BHK in Whitefield up to ₹90\u00a0L, the three Meridian Greens units that match, his earlier enquiry, and Hinglish in the evening. The brochure doesn't say whether a covered car park is included, so the agent asks Priya Nair, the sales manager, on WhatsApp. She replies: "${reply}" The answer is saved to the Meridian Greens facts, so every later call knows it. ${intentSignals.map((s) => `${s.label} +${s.weight}`).join(", ")}: intent ${total} out of ${outOf}, high. Then a six-step call plan, and the agent calls Rohan at 7:14\u00a0PM in Hinglish.`,
  quote: "\u201c",
  // The agent's voice, one caption per beat of the loop.
  captions: [
    {
      time: "7:12:04\u00a0PM",
      text: "Rohan Mehta, from tonight's import. Before I call him, I'll prepare.",
    },
    {
      time: "7:12:06\u00a0PM",
      text: "He wants a 2\u00a0BHK in Whitefield, up to ₹90\u00a0L. He wrote in Hinglish.",
    },
    {
      time: "7:12:11\u00a0PM",
      text: "Meridian Greens, Tower B, has three 2\u00a0BHKs under ₹90\u00a0L.",
    },
    {
      time: "7:12:18\u00a0PM",
      text: "He enquired on 2\u00a0Sep too, and asked about possession.",
    },
    {
      time: "7:12:24\u00a0PM",
      text: "Hinglish, and he enquired at 7:12\u00a0PM. Evening is his time.",
    },
    {
      time: "7:12:40\u00a0PM",
      text: "The brochure doesn't say if parking is included. Asking Priya in sales.",
    },
    {
      time: "7:13:30\u00a0PM",
      text: "Priya: one covered spot is included. Floor rise is extra.",
    },
    {
      time: "7:13:31\u00a0PM",
      text: "Saved to Meridian Greens facts, so every later call knows it too.",
    },
    {
      time: "7:13:40\u00a0PM",
      text: "Now his intent, one signal at a time.",
    },
    {
      time: "7:13:42\u00a0PM",
      text: `${total} of ${outOf}: high intent. He gets a call tonight.`,
    },
    { time: "7:13:44\u00a0PM", text: "Writing the call plan." },
    {
      time: "7:13:50\u00a0PM",
      text: "Brief ready. Calling Rohan at 7:14\u00a0PM, in Hinglish.",
    },
  ],
  rail: {
    title: "What the agent looked at",
    items: [
      { title: "Tonight's import", detail: "CSV · 7:12\u00a0PM" },
      { title: "Inventory sheet", detail: "Meridian Greens" },
      {
        title: "Enquiry history",
        detail: "2\u00a0Sep · asked\u00a0possession",
      },
      { title: "His note", detail: "Hinglish · 7:12\u00a0PM" },
      { title: "Priya Nair, sales", detail: "WhatsApp · 1\u00a0question" },
      { title: "Intent signals", detail: signals },
    ],
    // The score, built: each signal's weight, then the sum.
    signals: intentSignals.map((s) => ({
      label: s.label,
      weight: `+${s.weight}`,
    })),
    total: `= ${score}`,
  },
  ghost: {
    title: "Call brief ·",
    lead: "Karthik Rao",
    next: "Next · ",
    time: "7:16\u00a0PM",
  },
  card: {
    title: "Call brief ·",
    lead: "Rohan Mehta",
    sub: "2\u00a0BHK · Whitefield · imported 7:12\u00a0PM",
    preparing: "Preparing",
    ready: "Ready",
  },
  rows,
  question: {
    label: "Open question",
    ask: open,
    asking: "Asking Priya Nair on WhatsApp…",
    answer: "One covered car park included",
    detail: "Floor rise is extra above the 10th floor",
    saved: "Saved to Meridian Greens facts",
    unknown: "not in brochure",
    source: "from Priya · 7:13\u00a0PM",
  },
  // Priya's reply, the moment the section is about.
  priya: {
    initials: "PN",
    name: "Priya Nair",
    role: "Sales manager · WhatsApp",
    time: "7:13\u00a0PM",
    you: "You",
    ask,
    reply,
  },
  intent: {
    label: "Intent",
    level: "High",
    score,
    note: `${signals} · ${callNow} or more means call now`,
    source: "scored · 7:13\u00a0PM",
  },
  plan: {
    title: "Call plan",
    meta: "6 steps · Hinglish",
    steps: [
      { text: "Greet in Hinglish" },
      { text: "Confirm 2\u00a0BHK, Whitefield, ₹90\u00a0L" },
      { text: "Possession: December 2027" },
      { text: "Covered car park included", via: "from Priya" },
      { text: "Offer a Saturday site visit" },
      { text: "Offer the home\u2011loan partner" },
    ] as readonly { text: string; via?: string }[],
  },
  footer: {
    waiting: "The call waits for the brief",
    stamp: "Ready · calling 7:14\u00a0PM",
    calling: "Calling in Hinglish · 0:0",
  },
  // The study's own sound switch (the message chime when Priya replies).
  sound: { label: "Sound", on: "on", off: "off" },
} as const;
