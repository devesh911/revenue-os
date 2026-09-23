// "Why us": the section head, the three competitive moats, and the words drawn on
// their illustration plates. Copy lives here; Moats.tsx and MoatArt compose it and
// inline none of these strings (separation pin). `art` picks the MoatArt plate
// drawn on each card. Em dashes carry a no-break space before them so a narrow
// column never opens a line on one.

export interface Moat {
  kicker: string;
  title: string;
  copy: string;
  art: "depth" | "india" | "loop";
}

export const moatsHead = {
  kicker: "Why this survives",
  title: "Three competitors, three moats.",
  lede: "Each competitor is strong somewhere. These are the places they structurally can’t follow.",
} as const;

export const moats: Moat[] = [
  {
    kicker: "VS HORIZONTAL PLAYERS",
    title: "Vertical depth beats breadth",
    art: "depth",
    copy: "Generalists span ten industries. We live inside one vertical’s workflow\u00a0— inventory, site visits, RERA paperwork\u00a0— deeper than a horizontal player can justify going.",
  },
  {
    kicker: "VS U.S. PLATFORMS",
    title: "Built for India, not ported",
    art: "india",
    copy: "RERA, TRAI/DND compliance, Hinglish, Indian CRM stacks. The localization work is our barrier to entry\u00a0— not something a ported product bolts on.",
  },
  {
    kicker: "VS VOICE INFRA",
    title: "The data loop, not the calling",
    art: "loop",
    copy: "Infra platforms sell minutes. Our value is the conversion data loop\u00a0— every closed sale sharpens who gets called next. That compounds; per-minute pricing doesn’t.",
  },
];

// The plate words: the strata the depth shaft passes (top down), the greetings the
// India plate floats in the words buyers actually use, and its compliance stamp.
export const moatArt = {
  strata: ["INVENTORY", "SITE VISITS", "RERA"],
  greetings: ["Namaste", "Haan ji", "Hello"],
  stamp: "RERA",
} as const;
