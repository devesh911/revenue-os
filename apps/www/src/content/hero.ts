// The hero's copy, the sample recording its listen button plays in place, and the
// two example calls HeroCall loops — a buyer ready to visit (the sample call's own
// conversation in four lines: the agent's possession answer carries the visit ask)
// and one still exploring, routed into follow-ups.
// Hero, SampleAudio and HeroCall compose these and inline none. The recording is
// SYNTHETIC (apps/www/scripts/make-sample-call.ts). Names, places and figures are
// illustrative. \u00a0 keeps a number with its unit; \u2011 is a non-breaking hyphen.

const ILLUSTRATIVE = "Names and figures are illustrative.";

export const sampleCall = {
  src: "/sample-call.m4a",
  seconds: 42,
  label: "Sample call",
  disclosure: `Recreated with basic text-to-speech, not the voice used on real calls. ${ILLUSTRATIVE}`,
  play: "Play sample call", // after it has finished
  pause: "Pause sample call",
  resume: "Resume sample call",
  unavailable: "The recording didn't load.",
} as const;

export const hero = {
  eyebrow: "Voice AI for Indian real estate",
  title: "Turn property enquiries into qualified site visits.",
  sub: "Revenue OS calls new leads in Hinglish, qualifies budget and timeline, and follows up on WhatsApp\u2060—so your sales team can focus on buyers ready to visit.",
  secondary: "Hear a sample call",
  caption: sampleCall.label,
} as const;

// The call card's fixed chrome. Only what exists today: leads arrive by import,
// the team gets a qualification summary (CRM connectors and intent scoring are
// planned), and readiness is shown as a gauge, never a score.
export const callLabels = {
  aria: "Sample call: an AI agent calls a new property enquiry after import, talks in Hinglish, captures budget and timeline, then books a site visit or schedules WhatsApp follow-ups.",
  newLead: "New lead",
  status: { ringing: "Ringing…", live: "On call", ended: "Ended" },
  calling: "Calling", // the empty transcript while the phone rings
  called: "Called", // + the scenario's "2 min after import"
  agent: "Agent · Asha",
  captured: "Captured",
  summary: "→ Summary for your team",
  readiness: "Readiness",
} as const;

export type Intent = "high" | "low";

export interface CallScenario {
  intent: Intent;
  time: string; // when the enquiry was imported
  lead: string;
  source: string; // imported enquiry · configuration · locality
  calledAfter: string; // import → first ring, in minutes
  seconds: number; // the finished call's length
  lines: { who: "agent" | "lead"; text: string }[];
  captured: string[]; // the fields in the team's summary
  score: number; // the gauge's fill, 0–100 (never shown as a number)
  verdict: string;
  outcome: { title: string; detail: string };
}

export const calls: CallScenario[] = [
  {
    intent: "high",
    time: "11:42 AM",
    lead: "Rohan Mehta",
    source: "Imported enquiry · 2 BHK · Whitefield",
    calledAfter: "2 min after import",
    seconds: sampleCall.seconds,
    lines: [
      {
        who: "agent",
        text: "Namaste Rohan ji, main Asha bol rahi hoon, Meridian Homes se. Aapne abhi Whitefield ke 2 BHK ke baare mein enquiry ki thi?",
      },
      {
        who: "lead",
        text: "Haan ji. Budget around 90 lakh hai. Possession kab tak milega?",
      },
      {
        who: "agent",
        text: "Tower B mein December 2027 mein possession hai. Kya aap Saturday ko site visit ke liye aa sakte hain?",
      },
      { who: "lead", text: "Saturday, 11 baje theek rahega." },
    ],
    captured: [
      "Budget ₹90\u00a0L",
      "2\u00a0BHK · Whitefield",
      "Within 12 months",
      "Visit Sat",
    ],
    score: 86,
    verdict: "Ready to visit",
    outcome: {
      title: "Site visit booked",
      detail: "Sat, 11:00\u00a0AM · WhatsApp confirmation sent",
    },
  },
  {
    intent: "low",
    time: "4:18 PM",
    lead: "Rahul M.",
    source: "Imported enquiry · 3 BHK · Kharadi",
    calledAfter: "3 min after import",
    seconds: 34,
    lines: [
      {
        who: "agent",
        text: "Hi Rahul, Meridian Homes se Asha. Kharadi 3\u00a0BHK ke liye enquiry ki thi aapne?",
      },
      {
        who: "lead",
        text: "Haan, abhi bas explore kar raha hoon. Shayad next year.",
      },
      {
        who: "agent",
        text: "Bilkul. Main floor plans WhatsApp kar deti hoon\u00a0— March mein phir baat karein?",
      },
      { who: "lead", text: "Theek hai, bhej dijiye." },
    ],
    captured: ["3\u00a0BHK", "Timeline 2027", "Exploring"],
    score: 34,
    verdict: "Not ready yet",
    outcome: {
      title: "Follow\u2011ups scheduled",
      detail:
        "Floor plans and price sheet on WhatsApp · re\u2011call scheduled for March",
    },
  },
];
