import { MonoLabel } from "./design/MonoLabel";
import { Faq } from "./sections/Faq";
import { FooterCta } from "./sections/FooterCta";
import { Hero } from "./sections/Hero";
import { IntentRouting } from "./sections/IntentRouting";
import { Logos } from "./sections/Logos";
import { Moats } from "./sections/Moats";
import { Nav } from "./sections/Nav";
import { Pricing } from "./sections/Pricing";
import { StageGrid } from "./sections/StageGrid";

// The composed marketing page — the nine sections pinned to their landmarks
// (header → nav, main → the content sections, footer → the meta row). SSR-safe: no
// CSS side-effect import lives here (main.tsx owns `import "./styles.css"`), so the
// copy-parity suite can renderToStaticMarkup(<App/>) without a stylesheet loader.
// The page shell — night ground, a fixed grain overlay, a centred max-width wrap —
// frames them all.
const FOOT_META = "text-[11.5px] tracking-[0.24em] text-cream-45";

export function App() {
  return (
    <div className="relative min-h-screen bg-ground font-body text-cream">
      <div
        aria-hidden="true"
        className="bg-noise pointer-events-none fixed inset-0 z-[60] opacity-35"
      />
      <div className="relative mx-auto max-w-[1360px] px-[28px] pt-[28px] max-[680px]:px-[12px] max-[680px]:pt-[12px]">
        <header>
          <Nav />
        </header>
        <main>
          <Hero />
          <Logos />
          <StageGrid />
          <IntentRouting />
          <Moats />
          <Pricing />
          <Faq />
          <FooterCta />
        </main>
        <footer className="mb-[28px] flex flex-wrap justify-between gap-[12px] border border-hairline-22 border-t-0 px-[32px] py-[24px]">
          <MonoLabel className={FOOT_META}>REVENUE OS © 2026</MonoLabel>
          <MonoLabel className={FOOT_META}>
            TRAI / DND COMPLIANT · RERA AWARE · BUILT IN INDIA
          </MonoLabel>
        </footer>
      </div>
    </div>
  );
}
