// The funnel-engine stages + the intent split. Copy lives here; StageGrid and
// IntentRouting compose it and inline none of these strings (separation pin).

export interface Stage {
  num: string;
  title: string;
  kicker: string;
  copy: string;
}

export const stages: Stage[] = [
  {
    num: "01",
    title: "Answer fast",
    kicker: "CALL IN MINUTES",
    copy: "Every portal, ad, and referral lead gets a call in minutes, in Hinglish or eleven Indian languages — not tomorrow morning.",
  },
  {
    num: "02",
    title: "Score intent",
    kicker: "PROPENSITY MODEL",
    copy: "Each caller is ranked against the profile that historically converts for this project, so human hours go where they pay.",
  },
  {
    num: "03",
    title: "Qualify",
    kicker: "BUDGET · TIMELINE",
    copy: "Budget, timeline, financing, configuration — captured conversationally and written straight into your CRM.",
  },
  {
    num: "04",
    title: "Book visit",
    kicker: "CALL + WHATSAPP",
    copy: "High-intent buyers get a confirmed site-visit slot, reminders, and directions — before a human ever touches the lead.",
  },
];

export interface IntentRoute {
  arrow: string;
  label: string;
  tone: "low" | "high";
  copy: string;
}

export const intents: IntentRoute[] = [
  {
    arrow: "↻",
    label: "LOW INTENT",
    tone: "low",
    copy: "Nurture loop — WhatsApp follow-ups and scheduled re-calls until intent changes.",
  },
  {
    arrow: "→",
    label: "HIGH INTENT",
    tone: "high",
    copy: "Human closer, briefed by the machine. Site visit → sale. Priced on outcomes.",
  },
];
