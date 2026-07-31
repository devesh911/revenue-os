import { CtaButton } from "../design/CtaButton";
import { Heading } from "../design/Heading";

// The top nav: wordmark · three anchor links · a gold "BOOK A PILOT" CTA. A 5-track
// grid on desktop that collapses to a wrapped flex column below 980px (the export's
// `.ro-nav` responsive behaviour, breakpoint preserved).
const LINKS: Array<{ label: string; href: string }> = [
  { label: "HOW IT WORKS", href: "#how" },
  { label: "WHY US", href: "#moats" },
  { label: "PRICING", href: "#pricing" },
];

const LINK_CLS =
  "flex items-center border-r border-hairline-18 px-[34px] font-mono text-[13px] tracking-[0.28em] text-cream-75 no-underline hover:bg-cream-04 hover:text-cream focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-[3px] max-[980px]:flex-1 max-[980px]:justify-center max-[980px]:whitespace-nowrap max-[980px]:border-r-0 max-[980px]:px-[6px] max-[980px]:py-[16px] max-[980px]:text-[11px] max-[980px]:tracking-[0.14em]";

export function Nav() {
  return (
    <nav className="grid grid-cols-[280px_1fr_1fr_1fr_auto] border border-hairline-22 bg-cream-02 max-[980px]:flex max-[980px]:flex-wrap">
      <div className="border-r border-hairline-18 px-[30px] py-[26px] max-[980px]:basis-full max-[980px]:border-r-0 max-[980px]:border-b max-[980px]:border-hairline-18 max-[980px]:px-[24px] max-[980px]:py-[20px]">
        <Heading
          as="div"
          className="text-[30px] leading-[0.95] tracking-[0.02em]"
        >
          REVENUE
          <br />
          OS
        </Heading>
      </div>
      {LINKS.map((link) => (
        <a key={link.href} className={LINK_CLS} href={link.href}>
          {link.label}
        </a>
      ))}
      <div className="flex items-center px-[26px] max-[980px]:basis-full max-[980px]:border-t max-[980px]:border-hairline-18 max-[980px]:px-[24px] max-[980px]:py-[14px]">
        <CtaButton
          variant="accent"
          href="#cta"
          className="px-[22px] py-[12px] font-mono text-[13px] tracking-[0.22em] max-[980px]:block max-[980px]:w-full max-[980px]:text-center"
        >
          BOOK A PILOT
        </CtaButton>
      </div>
    </nav>
  );
}
