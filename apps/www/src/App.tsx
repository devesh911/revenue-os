import { useLayoutEffect } from "react";
import { brand, footerMeta } from "./content/site";
import { Label } from "./design/Label";
import { BookingProvider } from "./lib/bookingContext";
import { ClosingCta } from "./sections/ClosingCta";
import { Examples } from "./sections/Examples";
import { Faq } from "./sections/Faq";
import { Hero } from "./sections/Hero";
import { HowItWorks } from "./sections/HowItWorks";
import { Nav } from "./sections/Nav";
import { Pilot } from "./sections/Pilot";
import { Proof } from "./sections/Proof";
import { BookingDialog } from "./visuals/BookingDialog";
import { BrandMark } from "./visuals/BrandMark";

// The composed page, demo-first: every primary button opens the one BookingDialog
// (mounted once, inside BookingProvider). Order: hero with the sample call → proof
// → how it works → examples → the pilot → FAQ → the closing invitation. SSR-safe:
// main.tsx owns the stylesheet import. The layout effect honours a cold-load deep
// link (/#pilot) — the page renders client-side, so the browser's own jump fires
// before the target exists; #book is handled by BookingProvider.
export function App() {
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
          className="-translate-y-[200%] fixed top-[12px] left-[12px] z-[60] rounded-[10px] bg-ink px-[16px] py-[10px] text-[15px] text-paper transition-transform duration-150 focus:translate-y-0"
        >
          {footerMeta.skip}
        </a>
        <header className="sticky top-0 z-50">
          <Nav />
        </header>
        <main id="main">
          <Hero />
          <Proof />
          <HowItWorks />
          <Examples />
          <Pilot />
          <Faq />
          <ClosingCta />
        </main>
        <footer className="mx-auto mt-[28px] max-w-[1224px] px-[20px] md:mt-[44px] md:px-[32px]">
          <div className="flex flex-col gap-[8px] border-line border-t py-[32px] md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-[10px] text-ink">
              <BrandMark className="size-[20px]" />
              <span className="font-semibold text-[16px] tracking-[-0.01em]">
                {brand}
              </span>
            </div>
            <Label>
              {footerMeta.note} · {footerMeta.copyright}
            </Label>
          </div>
        </footer>
        <BookingDialog />
      </div>
    </BookingProvider>
  );
}
