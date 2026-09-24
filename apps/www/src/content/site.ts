// Site chrome copy — the brand, the nav, the one call to action every primary
// button carries, the page-wide motion switch and the footer. Nav.tsx, Hero.tsx,
// App.tsx and lib/bookingContext.tsx compose these and inline none.

interface NavLink {
  label: string;
  href: string;
}

export const brand = "Revenue OS";

export const navLabel = "Primary";

export const navLinks: NavLink[] = [
  { label: "How it works", href: "#how" },
  { label: "Examples", href: "#examples" },
  { label: "Pilot", href: "#pilot" },
  { label: "FAQ", href: "#faq" },
];

// The page's single primary action — every primary button opens the same booking flow.
export const bookDemo = "Book a demo";

export const menuLabels = { open: "Menu", close: "Close" } as const;

// The page-wide switch in the hero, under the sample-call note (WCAG 2.2.2).
export const motionToggle = {
  pause: "Pause animations",
  play: "Play animations",
} as const;

export const footerMeta = {
  copyright: "Revenue OS © 2026",
  note: "Built in India",
  skip: "Skip to content",
} as const;
