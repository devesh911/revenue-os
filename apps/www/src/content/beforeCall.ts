// "Before the call" — what Revenue OS does between an imported enquiry and the first
// ring: it scores the buyer's intent from the enquiry's signals, then builds the call
// brief, putting a question the brochure can't answer to the sales team. Both visuals
// (IntentEvidence, CallBrief) read the SAME signals below, so their sums always
// agree. ILLUSTRATIVE: intent scoring and questions to the sales team are planned
// (pilot.ts lists intent scoring as planned), so the section carries the label on its
// face. BeforeCall.tsx composes the head; the visuals compose the rest.

export const beforeCall = {
  kicker: "Before the call",
  title: "Your team answers once. Every call knows.",
  sub: "When a buyer asks something the brochure doesn't cover, Revenue OS asks your sales team, saves the answer to the project, and every call after that gets it right.",
  illustrative: "Illustrative example",
} as const;

export interface IntentSignal {
  label: string;
  detail: string;
  weight: number;
}

// The four signals that build Rohan's score, in the order they're found.
export const intentSignals: IntentSignal[] = [
  {
    label: "Repeat enquiry",
    detail: "His second enquiry this month",
    weight: 24,
  },
  {
    label: "Budget fits",
    detail: "₹90 L · three open 2 BHK units under it",
    weight: 22,
  },
  {
    label: "Timeline known",
    detail: "Said “next year” on his first enquiry",
    weight: 16,
  },
  {
    label: "Asked about possession before",
    detail: "On his first enquiry, 2 Sep",
    weight: 16,
  },
];

export const intentScore = {
  total: intentSignals.reduce((sum, s) => sum + s.weight, 0), // 78
  outOf: 100,
  callNow: 50, // at or above: call tonight; below: the follow-up plan
} as const;
