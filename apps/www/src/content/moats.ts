// The three competitive moats. Copy lives here; Moats.tsx composes it and inlines
// none of these strings (separation pin). `grad` picks a bg-moat-* decorative wash.

export interface Moat {
  kicker: string;
  title: string;
  copy: string;
  grad: "a" | "b" | "c";
}

export const moats: Moat[] = [
  {
    kicker: "VS HORIZONTAL PLAYERS",
    title: "Vertical depth beats breadth",
    grad: "a",
    copy: "Generalists span ten industries. We live inside one vertical’s workflow — inventory, site visits, RERA paperwork — deeper than a horizontal player can justify going.",
  },
  {
    kicker: "VS US PLATFORMS",
    title: "Built for India, not ported",
    grad: "b",
    copy: "RERA, TRAI/DND compliance, Hinglish, Indian CRM stacks. The localization work is our barrier to entry — not something a ported product bolts on.",
  },
  {
    kicker: "VS VOICE INFRA",
    title: "The data loop, not the calling",
    grad: "c",
    copy: "Infra platforms sell minutes. Our value is the conversion data loop — every closed sale sharpens who gets called next. That compounds; per-minute pricing doesn’t.",
  },
];
