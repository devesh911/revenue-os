// Site chrome copy — the nav, the brand, and the footer meta row. Nav.tsx and
// App.tsx compose these and inline none of them.

export interface NavLink {
  label: string;
  href: string;
}

export const brand = "Revenue OS";

export const navLinks: NavLink[] = [
  { label: "How it works", href: "#how" },
  { label: "Why us", href: "#moats" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export const navCta = "Book a pilot";

export const footerMeta = {
  copyright: "Revenue OS © 2026",
  compliance: "TRAI / DND compliant · RERA aware · Built in India",
  skip: "Skip to content",
} as const;
