// The three pricing tiers and the section's framing copy. Pricing.tsx composes it
// and inlines none of these strings (separation pin). `id` doubles as the data-plan
// hook; `defaultPlanId` is the tier selected on first paint (the SSR default pinned
// by the copy-parity suite).

export interface Plan {
  id: "pilot" | "funnel" | "os";
  name: string;
  blurb: string;
  price: string;
  priceSub: string;
  features: string[];
  cta: string;
}

export const pricingCopy = {
  kicker: "Pricing",
  title: "Choose a plan to connect Revenue OS.",
  sub: "All tiers run the full funnel engine — voice\u00a0+\u00a0WhatsApp agents, intent scoring, and outcome-based pricing on qualified site visits.",
  footnote:
    "Platform fees credit against outcome fees\u00a0— you never pay twice for the same visit.",
  selectedHint: "Selected plan",
} as const;

export const plans: Plan[] = [
  {
    id: "pilot",
    name: "Pilot",
    blurb: "Prove it on one project, risk-free.",
    price: "₹0",
    priceSub: "platform fee",
    cta: "Start the pilot",
    features: [
      "One project",
      "Up to 500 leads a month",
      "Voice + WhatsApp agents",
      "Pay per qualified visit",
    ],
  },
  {
    id: "funnel",
    name: "Funnel Engine",
    blurb: "The full engine on every lead you get.",
    price: "₹60K",
    priceSub: "per month",
    cta: "Subscribe and connect",
    features: [
      "Unlimited leads",
      "Intent scoring model",
      "Nurture loop + re-calls",
      "CRM sync",
      "Reduced outcome fees",
    ],
  },
  {
    id: "os",
    name: "Revenue OS",
    blurb: "The funnel, carried through to possession.",
    price: "Custom",
    priceSub: "",
    cta: "Talk to us",
    features: [
      "Everything in Funnel Engine",
      "Documentation workflows",
      "Loan handoff",
      "Possession servicing",
      "Dedicated models",
    ],
  },
];

export const defaultPlanId: Plan["id"] = "funnel";
export const choosePlanLabel = "Choose plan";
