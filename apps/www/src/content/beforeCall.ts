// How it works, told as one enquiry in order — the page's middle. The intro, then
// chapter 01 (before the call: the brief assembles, with the question the brochure
// can't answer put to the sales team — CallBrief) and chapter 02 (call now or follow
// up: the brief's Intent row opened up, worked out from four signals — IntentEvidence). Chapter 03, the
// call and after, is the engine panel (workflow.ts). Both visuals read the SAME
// signals below, so their sums always agree. ILLUSTRATIVE: intent scoring and
// questions to the sales team are planned (pilot.ts lists intent scoring as
// planned), so chapters 01 and 02 carry the label on their face. HowItWorks.tsx
// composes the heads; the visuals compose the rest.

export const howItWorks = {
  kicker: "How it works",
  title: "Follow one enquiry, from import to site visit.",
  sub: "One evening, one buyer: Rohan Mehta's enquiry arrives in your lead import (a CSV from your portal or CRM) at 7:12\u00a0PM. Here is what Revenue\u00a0OS does before it calls him, how it decides to call now or follow up, and what happens on the call and after.",
  illustrative: "Illustrative example",
} as const;

export const chapters = {
  context: {
    step: "01",
    kicker: "Before the call",
    title: "Your team answers once. Every call knows.",
    sub: "Before every call, Revenue\u00a0OS writes a brief: the enquiry, the units that match, his history and his language. Anything the brochure doesn't answer goes to your sales team once, and the answer is saved for every call after. Then it checks his intent and plans the call.",
  },
  intent: {
    step: "02",
    kicker: "Call now or follow up",
    title: "Every score shows its working.",
    sub: "The Intent row from Rohan's brief, opened up: four signals add up to 78 out of 100. At 50 or more the agent calls tonight; below that, the buyer gets the follow-up plan.",
  },
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
