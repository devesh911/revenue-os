import { brand, footerMeta } from "./content/site";
import { MonoLabel } from "./design/MonoLabel";
import { useReveal } from "./lib/reveal";
import { Faq } from "./sections/Faq";
import { FooterCta } from "./sections/FooterCta";
import { Hero } from "./sections/Hero";
import { Logos } from "./sections/Logos";
import { Moats } from "./sections/Moats";
import { Nav } from "./sections/Nav";
import { Pricing } from "./sections/Pricing";
import { StageGrid } from "./sections/StageGrid";
import { BrandMark } from "./visuals/BrandMark";

// The composed marketing page on warm paper: a sticky header → nav, the sections in
// <main> (StageGrid hosts the funnel flow + IntentRouting inside its dark panel),
// and the footer meta row. SSR-safe: no CSS side-effect import lives here (main.tsx
// owns `import "./styles.css"`), so the copy-parity suite can
// renderToStaticMarkup(<App/>). useReveal() arms the one-shot scroll reveals.
export function App() {
  useReveal();
  return (
    <div id="top" className="relative min-h-screen bg-paper font-sans text-ink">
      <a
        href="#main"
        className="sr-only rounded-full bg-ink px-[16px] py-[10px] text-paper focus:not-sr-only focus:fixed focus:top-[12px] focus:left-[12px] focus:z-[60]"
      >
        {footerMeta.skip}
      </a>
      <header className="sticky top-0 z-50">
        <Nav />
      </header>
      <main id="main">
        <Hero />
        <Logos />
        <StageGrid />
        <Moats />
        <Pricing />
        <Faq />
        <FooterCta />
      </main>
      <footer className="mx-auto mt-[40px] max-w-[1200px] px-[20px] md:mt-[64px] md:px-[40px]">
        <div className="flex flex-col gap-[14px] border-line border-t py-[36px] md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-[10px] text-ink">
            <BrandMark className="size-[20px]" />
            <span className="font-serif text-[17px] tracking-[-0.02em]">
              {brand}
            </span>
          </div>
          <MonoLabel className="text-[11.5px] text-stone uppercase tracking-[0.1em]">
            {footerMeta.compliance}
          </MonoLabel>
          <MonoLabel className="text-[11.5px] text-stone tracking-[0.06em]">
            {footerMeta.copyright}
          </MonoLabel>
        </div>
      </footer>
    </div>
  );
}
