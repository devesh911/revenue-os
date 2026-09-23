import { cta } from "../content/cta";
import { CtaButton } from "../design/CtaButton";
import { DotList } from "../design/DotList";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { SectionFrame } from "../design/SectionFrame";
import { reveal } from "../lib/reveal";
import { CallArt } from "../visuals/CallArt";

// The closing offer (#cta) on the clay panel: eyebrow, the risk-reversal headline,
// the pilot's terms, one ink pill; beside it (md+) the brand mark at poster scale.
// Everything on clay is ink — small text at ink/85 (≥4.5:1); SectionFrame turns
// the focus rings ink. Each term is led by a "·" the list clips at every line
// start, so a wrapped line neither starts nor ends on a separator; the dot is
// generated content with empty alt text, so screen readers skip it.
export function FooterCta() {
  return (
    <SectionFrame
      id="cta"
      tone="clay"
      className="grid items-center gap-[48px] md:grid-cols-[3fr_2fr] lg:gap-[64px]"
    >
      <div {...reveal()} className="flex flex-col items-start">
        <Kicker tone="clay">{cta.kicker}</Kicker>
        <Heading className="mt-[24px] max-w-[19ch]">{cta.headline}</Heading>
        <DotList
          items={cta.terms}
          className="mt-[28px] gap-y-[4px] font-mono text-[12.5px] text-ink/85 tracking-[0.04em]"
        />
        <CtaButton
          variant="accent"
          size="lg"
          arrow
          href={cta.href}
          className="mt-[40px]"
        >
          {cta.button}
        </CtaButton>
      </div>
      <div {...reveal(160)} className="hidden justify-center md:flex">
        <CallArt className="w-full max-w-[420px]" />
      </div>
    </SectionFrame>
  );
}
