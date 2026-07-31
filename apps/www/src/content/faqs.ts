// The five questions asked before every pilot. Copy lives here; Faq.tsx composes it
// and inlines none of these strings (separation pin). `defaultOpenFaq` is the item
// open on first paint — the SSR default the copy-parity suite pins.

export interface Faq {
  q: string;
  a: string;
}

export const faqs: Faq[] = [
  {
    q: "Is this compliant with TRAI and DND rules?",
    a: "Yes. Every outbound call runs through consent-checked lists, honors DND registries, and logs a full audit trail. RERA-relevant disclosures are built into the agent’s scripts per project.",
  },
  {
    q: "Can the agents actually handle Hinglish?",
    a: "Hinglish is the default, not a feature. Agents code-switch mid-sentence the way buyers do, and support eleven Indian languages for regional projects.",
  },
  {
    q: "Does it replace my telecalling team?",
    a: "It replaces machine-time work — first response, screening, follow-ups. Your best closers stay, and they only ever talk to briefed, high-intent buyers.",
  },
  {
    q: "How does outcome pricing work?",
    a: "You pay per qualified site visit that actually happens. Platform fees on paid tiers credit against outcome fees, so you never pay twice for the same visit.",
  },
  {
    q: "What does the pilot involve?",
    a: "One project, your live lead flow, four weeks. We run head-to-head against your current telecalling process. If we don’t beat it on conversion to site visit, you pay nothing.",
  },
];

export const defaultOpenFaq = 0;
