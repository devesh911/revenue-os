import { useLayoutEffect } from "react";
import { brand, footerMeta } from "./content/site";
import { DotList } from "./design/DotList";
import { MonoLabel } from "./design/MonoLabel";
import { BookingProvider } from "./lib/bookingContext";
import { useReveal } from "./lib/reveal";
import { Faq } from "./sections/Faq";
import { FooterCta } from "./sections/FooterCta";
import { Hero } from "./sections/Hero";
import { HowItWorks } from "./sections/HowItWorks";
import { Moats } from "./sections/Moats";
import { Nav } from "./sections/Nav";
import { Pricing } from "./sections/Pricing";
import { Proof } from "./sections/Proof";
import { StageGrid } from "./sections/StageGrid";
import { BookingDialog } from "./visuals/BookingDialog";
import { BrandMark } from "./visuals/BrandMark";

// The composed marketing page on warm paper: a skip link, a sticky header → nav,
// the sections in <main> (StageGrid hosts the funnel flow + IntentRouting inside
// its dark panel), and the footer meta row. SSR-safe: no CSS side-effect import
// lives here (main.tsx owns `import "./styles.css"`), so the copy-parity suite can
// renderToStaticMarkup(<App/>). useReveal() arms the one-shot scroll reveals; the
// layout effect honours a deep link (/#pilot) — the page renders client-side,
// so the browser's own jump fires before the target exists. Every "Book a demo"
// opens the one BookingDialog, mounted once inside BookingProvider (#book too).
export function App() {
  useReveal();
  useLayoutEffect(() => {
    const target =
      location.hash && document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView({ behavior: "instant" });
  }, []);
  return (
    <BookingProvider>
      <div
        id="top"
        className="relative min-h-screen bg-paper font-sans text-ink"
      >
        <a
          href="#main"
          className="-translate-y-[200%] fixed top-[12px] left-[12px] z-[60] rounded-full bg-ink px-[16px] py-[10px] text-[14.5px] text-paper transition-transform duration-200 focus:translate-y-0"
        >
          {footerMeta.skip}
        </a>
        <header className="sticky top-0 z-50">
          <Nav />
        </header>
        <main id="main">
          <Hero />
          <HowItWorks />
          <StageGrid />
          <Moats />
          <Pricing />
          <Proof />
          <Faq />
          <FooterCta />
        </main>
        <footer className="mx-auto mt-[40px] max-w-[1200px] px-[20px] md:mt-[64px] md:px-[40px]">
          <div className="flex flex-col gap-[14px] border-line border-t py-[36px] lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-[10px] text-ink">
              <BrandMark className="size-[20px]" />
              <span className="font-serif text-[17px] tracking-[-0.02em]">
                {brand}
              </span>
            </div>
            <DotList
              items={[footerMeta.note]}
              className="gap-y-[6px] font-mono text-[11.5px] text-stone uppercase tracking-[0.1em]"
            />
            <MonoLabel className="text-[11.5px] text-stone tracking-[0.06em]">
              {footerMeta.copyright}
            </MonoLabel>
          </div>
        </footer>
        <BookingDialog />
      </div>
    </BookingProvider>
  );
}
