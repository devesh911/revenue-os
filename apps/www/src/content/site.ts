// Site chrome copy — the nav, the brand, the page-wide motion switch, and the
// footer meta row. Nav.tsx, Hero.tsx and App.tsx compose these and inline none.

interface NavLink {
  label: string;
  href: string;
}

export const brand = "Revenue OS";

export const navLabel = "Primary";

export const navLinks: NavLink[] = [
  { label: "How it works", href: "#how" },
  { label: "Why us", href: "#moats" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export const navCta = "Book a pilot";

export const menuLabels = { open: "Menu", close: "Close" } as const;

export const motionToggle = {
  pause: "Pause animations",
  play: "Play animations",
} as const;

export const footerMeta = {
  copyright: "Revenue OS © 2026",
  compliance: ["TRAI / DND compliant", "RERA aware", "Built in India"],
  skip: "Skip to content",
} as const;
