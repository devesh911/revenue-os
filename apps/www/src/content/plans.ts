// The three pricing tiers. Copy lives here; Pricing.tsx composes it and inlines
// none of these strings (separation pin). `id` doubles as the data-plan hook and
// `defaultPlanId` is the tier selected on first paint (the SSR default pinned by
// the copy-parity suite). `grad` picks a bg-plan-* decorative wash.

export interface Plan {
  id: "pilot" | "funnel" | "os";
  name: string;
  price: string;
  priceSub: string;
  features: string[];
  cta: string;
  grad: "a" | "b" | "c";
}

export const plans: Plan[] = [
  {
    id: "pilot",
    name: "Pilot",
    price: "₹0",
    priceSub: " platform fee",
    grad: "a",
    cta: "START THE PILOT",
    features: [
      "· ONE PROJECT",
      "· UP TO 500 LEADS / MO",
      "· VOICE + WHATSAPP AGENTS",
      "· PAY PER QUALIFIED VISIT",
    ],
  },
  {
    id: "funnel",
    name: "Funnel Engine",
    price: "₹60K",
    priceSub: "/mo",
    grad: "b",
    cta: "SUBSCRIBE AND CONNECT",
    features: [
      "· UNLIMITED LEADS",
      "· INTENT SCORING MODEL",
      "· NURTURE LOOP + RE-CALLS",
      "· CRM SYNC",
      "· REDUCED OUTCOME FEES",
    ],
  },
  {
    id: "os",
    name: "Revenue OS",
    price: "Custom",
    priceSub: "",
    grad: "c",
    cta: "TALK TO US",
    features: [
      "· EVERYTHING IN FUNNEL",
      "· DOCUMENTATION WORKFLOWS",
      "· LOAN HANDOFF",
      "· POSSESSION SERVICING",
      "· DEDICATED MODELS",
    ],
  },
];

export const defaultPlanId: Plan["id"] = "funnel";
export const choosePlanLabel = "CHOOSE PLAN";
