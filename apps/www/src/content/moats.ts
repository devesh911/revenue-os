// "Why us": the section head and the three competitive moats. Copy lives here;
// Moats.tsx composes it and inlines none of these strings (separation pin). `art`
// picks the MoatArt line illustration drawn on each card's plate.

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
    copy: "Generalists span ten industries. We live inside one vertical’s workflow — inventory, site visits, RERA paperwork — deeper than a horizontal player can justify going.",
  },
  {
    kicker: "VS U.S. PLATFORMS",
    title: "Built for India, not ported",
    art: "india",
    copy: "RERA, TRAI/DND compliance, Hinglish, Indian CRM stacks. The localization work is our barrier to entry — not something a ported product bolts on.",
  },
  {
    kicker: "VS VOICE INFRA",
    title: "The data loop, not the calling",
    art: "loop",
    copy: "Infra platforms sell minutes. Our value is the conversion data loop — every closed sale sharpens who gets called next. That compounds; per-minute pricing doesn’t.",
  },
];
