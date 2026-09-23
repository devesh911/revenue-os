// The hero's copy and the two example calls HeroCall plays on a loop — a
// high-intent lead who books a site visit and a low-intent one routed into the
// nurture loop, so the hook shows both branches of the engine. Hero and HeroCall
// compose these and inline none of them. Names, numbers and projects are
// illustrative.

export const hero = {
  // The tail folds away on phones, where the full line would wrap the pill.
  kicker: {
    lead: "Voice AI · Indian real estate",
    tail: " · Priced on outcomes",
  },
  // The nbsp keeps "real estate" from breaking across lines.
  title: "The revenue operating system for Indian real\u00a0estate.",
  lede: "Voice agents are the front door. The product is the funnel — every conversation feeds the machine that decides who gets called next, and a human is inserted only when a human changes the outcome.",
  cta: { primary: "Run our pilot", secondary: "See the engine" },
  facts: [
    {
      k: "Minutes",
      v: "to the first call on every new lead — not tomorrow morning",
    },
    { k: "Hinglish", v: "by default, plus eleven Indian languages" },
    { k: "Per visit", v: "pay for qualified site visits, not minutes" },
  ],
  caption: "Example call · names and numbers are illustrative",
} as const;

// The call card's fixed chrome.
export const callLabels = {
  aria: "Example: an AI agent calls a new property lead within minutes, talks in Hinglish, captures budget and timeline, scores intent, and books a site visit or starts a nurture loop.",
  newLead: "New lead",
  status: { ringing: "Ringing…", live: "On call", ended: "Ended" },
  calledIn: "Called in",
  agent: "Agent · Asha",
  captured: "Captured",
  crm: "→ Written to CRM",
  intent: "Intent",
} as const;

export type Intent = "high" | "low";

export interface CallScenario {
  intent: Intent;
  time: string; // when the enquiry landed
  lead: string;
  source: string; // portal · configuration · locality
  calledIn: string; // enquiry → first ring (mm:ss)
  lines: { who: "agent" | "lead"; text: string }[];
  captured: string[]; // the fields written to the CRM
  score: number; // intent, 0–100
  verdict: string;
  outcome: { title: string; detail: string };
}

export const calls: CallScenario[] = [
  {
    intent: "high",
    time: "11:42 AM",
    lead: "Priya S.",
    source: "99acres · 2BHK · Whitefield, Bengaluru",
    calledIn: "00:47",
    lines: [
      {
        who: "agent",
        text: "Namaste Priya ji, Meridian Homes se Asha bol rahi hoon. Aapne Whitefield 2BHK ke baare mein poocha tha?",
      },
      {
        who: "lead",
        text: "Haan ji. Budget around 90 lakh hai — possession kab tak milega?",
      },
      {
        who: "agent",
        text: "Tower B, December 2027. Kya aap Saturday site visit ke liye free hain?",
      },
      { who: "lead", text: "Saturday 11 baje theek rahega." },
    ],
    captured: ["Budget ₹90L", "2BHK", "Visit Sat"],
    score: 86,
    verdict: "High intent",
    outcome: {
      title: "Site visit booked",
      detail: "Sat, 11:00 AM · Tower B · WhatsApp confirmation sent",
    },
  },
  {
    intent: "low",
    time: "4:18 PM",
    lead: "Rahul M.",
    source: "MagicBricks · 3BHK · Kharadi, Pune",
    calledIn: "01:12",
    lines: [
      {
        who: "agent",
        text: "Hi Rahul, Meridian Homes se Asha. Kharadi 3BHK ke liye enquiry ki thi aapne?",
      },
      {
        who: "lead",
        text: "Haan, abhi bas explore kar raha hoon. Shayad next year.",
      },
      {
        who: "agent",
        text: "Bilkul. Main floor plans WhatsApp kar deti hoon — March mein phir baat karein?",
      },
      { who: "lead", text: "Theek hai, bhej dijiye." },
    ],
    captured: ["3BHK", "Timeline 2027", "Exploring"],
    score: 34,
    verdict: "Low intent",
    outcome: {
      title: "Nurture loop",
      detail: "Floor plans sent on WhatsApp · re-call scheduled for March",
    },
  },
];
