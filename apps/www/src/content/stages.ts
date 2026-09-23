// The funnel-engine panel's copy: the section head, the flow diagram's labels, the
// four stages, and the intent split. StageGrid, FunnelFlow and IntentRouting
// compose it and inline none of these strings (separation pin). Em dashes carry a
// no-break space before them so a narrow column never opens a line on one.

export const engineHead = {
  kicker: "The funnel engine",
  heading: "Four stages run on machine time.",
  intro:
    "A lead enters, the AI works it end to end. High intent routes to a human closer; low intent enters the nurture loop. Every outcome retrains the scoring model.",
} as const;

export const flowLabels = {
  entry: "New leads",
  loop: "Nurture loop",
  loopArrow: "↻", // the loop's glyph, shared with the low-intent route below
  exit: "Human closer",
} as const;

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
    copy: "Every portal, ad, and referral lead gets a call in minutes, in Hinglish or eleven Indian languages\u00a0— not tomorrow morning.",
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
    copy: "Budget, timeline, financing, configuration\u00a0— captured conversationally and written straight into your CRM.",
  },
  {
    num: "04",
    title: "Book visit",
    kicker: "CALL + WHATSAPP",
    copy: "High-intent buyers get a confirmed site-visit slot, reminders, and directions\u00a0— before a human ever touches the lead.",
  },
];

export interface IntentRoute {
  tone: "low" | "high";
  arrow: string;
  label: string;
  title: string;
  copy: string;
}

export const intents: IntentRoute[] = [
  {
    tone: "low",
    arrow: flowLabels.loopArrow,
    label: "LOW INTENT",
    title: "Nurture loop",
    copy: "WhatsApp follow-ups and scheduled re-calls until intent changes.",
  },
  {
    tone: "high",
    arrow: "→",
    label: "HIGH INTENT",
    title: "Human closer, briefed by the machine",
    copy: "Site visit → sale. Priced on outcomes.",
  },
];
