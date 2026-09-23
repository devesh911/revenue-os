// The closing CTA on the clay panel — the risk-reversal offer, its terms, and the
// one button. FooterCta.tsx composes these and inlines none of them.

export const cta = {
  kicker: "Test before building",
  headline:
    "Give us one project’s lead flow. If we don’t beat your telecalling team, you don’t pay.",
  terms: ["Four weeks", "One project", "Your live lead flow"],
  button: "Book a pilot",
  href: "#pricing",
} as const;
