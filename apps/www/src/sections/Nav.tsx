import { useEffect, useState } from "react";
import { brand, navCta, navLinks } from "../content/site";
import { CtaButton } from "../design/CtaButton";
import { cx } from "../lib/cx";
import { BrandMark } from "../visuals/BrandMark";

// The top bar: wordmark · section anchors · the primary CTA pill. App wraps it
// in the sticky <header>; once the page scrolls, the bar frosts over and draws its
// hairline. Anchors fold away below md — the CTA and wordmark stay.
export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav
      aria-label="Primary"
      className={cx(
        "border-b transition-[background-color,border-color] duration-300",
        scrolled
          ? "border-line bg-paper/85 backdrop-blur-md"
          : "border-transparent bg-paper/0",
      )}
    >
      <div className="mx-auto flex h-[64px] max-w-[1200px] items-center justify-between gap-[24px] px-[20px] md:px-[40px]">
        <a
          href="#top"
          className="flex items-center gap-[10px] rounded-[6px] text-ink no-underline"
        >
          <BrandMark className="size-[26px]" />
          <span className="font-serif text-[21px] tracking-[-0.02em]">
            {brand}
          </span>
        </a>
        <div className="hidden items-center gap-[32px] md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-[4px] text-[14.5px] text-ink-2 no-underline transition-colors duration-200 hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </div>
        <CtaButton variant="accent" size="md" href="#cta">
          {navCta}
        </CtaButton>
      </div>
    </nav>
  );
}
