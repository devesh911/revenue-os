// Words for "Why he's a high-intent buyer" (visuals/IntentEvidence.tsx), the first
// study in "Before the call". The evidence and every number in it come from
// beforeCall.ts (intentSignals, intentScore), so this study and the call brief
// always agree; this module only holds the words around them: where the step sits
// in the story, the agent's running captions (one per beat), the ledger and routing
// labels, and the one-paragraph summary a screen reader hears in place of the
// animation. Illustrative: the section already carries the label.
import { intentScore, intentSignals } from "./beforeCall";

const { total, outOf, callNow } = intentScore;

export const intentEvidence = {
  // The six steps between import and the call; this study zooms into `at`.
  story: {
    steps: ["Import", "Context", "Sales check", "Intent", "Brief", "Call"],
    at: 3,
    time: "7:13:40\u00a0PM",
  },
  quote: "\u201c",
  // The agent's voice, one line per beat: before the evidence, one per signal (in
  // intentSignals order), the home loan, the total, the route. `crossed` follows the
  // line of whichever signal takes the score over the call-now line.
  captions: {
    open: "Before I call, I'll weigh what I found about Rohan.",
    signals: [
      "His second enquiry this month. He's still looking.",
      "His ₹90\u00a0L budget fits three open 2\u00a0BHK units.",
      "He said \u201cnext year\u201d on his first enquiry, so he has a timeline.",
      "He asked about possession back on 2\u00a0Sep. He's planning the move.",
    ],
    crossed: "That takes him past the call-now line.",
    context: "He needs a home loan. That's context for the call, not a minus.",
    total: `${total} of ${outOf}. High intent.`,
    route:
      "Calling him now, in Hinglish, at 7:14\u00a0PM. No brochure-and-wait for Rohan.",
  },
  evidence: `Evidence · ${intentSignals.length} signals`,
  weight: "Weight",
  callNowLine: "call-now line",
  context: {
    label: "Needs a home loan",
    detail: "context, not a minus",
    note: "offer the loan partner",
  },
  intent: "Intent",
  high: "High",
  outOf: `/ ${outOf}`,
  routing: {
    kicker: "Routing",
    note: `${callNow} and over gets a call tonight. Under ${callNow} gets the follow-up plan. Weights and the line are examples.`,
  },
  followUp: {
    kicker: `For buyers under ${callNow}`,
    title: "Follow-up plan",
    body: "Floor plans on WhatsApp today, a check-in on day\u00a07, a re-call on day\u00a030",
  },
  callNow: {
    kicker: `For buyers at ${callNow} and over`,
    title: "Call now",
    body: "Tonight, in Hinglish, with the brief in hand",
    chip: "Calling Rohan · 7:14\u00a0PM",
  },
  summary: [
    `Illustrative: why Rohan Mehta is a high-intent buyer. ${intentSignals.length} signals build his intent score:`,
    `${intentSignals.map((s) => `${s.label.toLowerCase()}, plus ${s.weight}`).join("; ")}.`,
    "Needing a home loan is context for the call, not a minus.",
    `The total is ${total} out of ${outOf}, above the call-now line at ${callNow}, so the agent calls him tonight at 7:14\u00a0PM, in Hinglish, with the brief in hand.`,
    `Buyers under ${callNow} get the follow-up plan instead: a WhatsApp brochure today and a re-call in 5\u00a0days.`,
  ].join(" "),
} as const;
