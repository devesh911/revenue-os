import { useEffect, useRef, useState } from "react";
import { brand, menuLabels, navLabel, navLinks } from "../content/site";
import { BookDemoButton } from "../lib/bookingContext";
import { cx } from "../lib/cx";
import { BrandMark } from "../visuals/BrandMark";
import { CLOSE, Icon, MENU } from "../visuals/Icon";

// The top bar: wordmark · section anchors · the demo button (the page's one primary action). App wraps it in
// the sticky <header>; once the page scrolls (or the menu opens) the bar turns
// solid paper over a hairline — opaque, so no panel below ghosts through it.
// Below md the anchors move into a disclosure menu: a 40px glyph button beside the
// CTA (its glyph optically flush with the gutter, so all three fit one line at
// 360px) drops a full-width panel under the bar — absolute, so the sticky header
// never grows and nothing below shifts. It closes on any link or button (the bar's demo button
// too), on a click outside the nav, on Escape (focus returns to the button), and
// when the viewport crosses md. Below 360px the
// wordmark text steps back to the mark alone (still named for screen readers).
const MD = "(min-width: 768px)";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const md = window.matchMedia(MD);
    const onMd = () => {
      if (md.matches) setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element;
      if (
        !button.current?.contains(t) &&
        (t.closest("a, button") || !nav.current?.contains(t))
      )
        setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    md.addEventListener("change", onMd);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
      md.removeEventListener("change", onMd);
    };
  }, [open]);

  return (
    <nav
      ref={nav}
      aria-label={navLabel}
      className={cx(
        "relative border-b transition-[background-color,border-color] duration-300",
        scrolled || open
          ? "border-line bg-paper"
          : "border-transparent bg-paper/0",
      )}
    >
      <div className="mx-auto flex h-[64px] max-w-[1224px] items-center justify-between gap-[16px] px-[20px] md:px-[32px]">
        <a
          href="#top"
          className="flex items-center gap-[10px] whitespace-nowrap rounded-[6px] text-ink no-underline"
        >
          <BrandMark className="size-[26px] shrink-0" />
          <span className="font-semibold text-[18px] tracking-[-0.015em] max-[360px]:sr-only">
            {brand}
          </span>
        </a>
        <ul className="hidden items-center gap-[32px] md:flex">
          {navLinks.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="inline-flex h-[40px] items-center rounded-[4px] text-[14.5px] text-ink-2 no-underline transition-colors duration-200 hover:text-ink"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-[4px]">
          <BookDemoButton source="nav" />
          <button
            ref={button}
            type="button"
            aria-expanded={open}
            aria-controls="nav-menu"
            aria-label={open ? menuLabels.close : menuLabels.open}
            onClick={() => setOpen(!open)}
            className="-mr-[13px] grid size-[44px] shrink-0 cursor-pointer place-items-center rounded-full text-ink transition-colors duration-200 hover:bg-ink/[0.05] md:hidden"
          >
            <Icon d={open ? CLOSE : MENU} className="size-[18px]" />
          </button>
        </div>
      </div>
      <ul
        id="nav-menu"
        hidden={!open}
        className="absolute inset-x-0 top-full border-line border-y bg-paper px-[20px] pb-[12px] transition-opacity duration-200 starting:opacity-0 md:hidden"
      >
        {navLinks.map((link) => (
          <li key={link.href} className="border-line border-b last:border-b-0">
            <a
              href={link.href}
              className="flex h-[56px] items-center rounded-[4px] font-medium text-[18px] text-ink no-underline"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
