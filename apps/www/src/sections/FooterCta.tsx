import { CtaButton } from "../design/CtaButton";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { SectionFrame } from "../design/SectionFrame";

// The closing guarantee CTA (#cta) — eyebrow, the risk-reversal headline, and a
// single gold "BOOK A PILOT →". A teal glow rises from the bottom (decorative).
export function FooterCta() {
  return (
    <SectionFrame
      id="cta"
      className="relative overflow-hidden px-[60px] py-[96px] text-center max-[680px]:px-[22px] max-[680px]:py-[60px]"
    >
      <div className="bg-footcta-glow pointer-events-none absolute inset-0" />
      <div className="relative flex flex-col items-center gap-[26px]">
        <Kicker>TEST BEFORE BUILDING</Kicker>
        <Heading className="max-w-[22ch] text-[clamp(34px,4vw,60px)] leading-[1.12] tracking-[0.01em]">
          Give us one project’s lead flow. If we don’t beat your telecalling
          team, you don’t pay.
        </Heading>
        <CtaButton
          variant="accent"
          href="#pricing"
          className="mt-[8px] px-[40px] py-[18px] font-mono text-[14px] tracking-[0.22em]"
        >
          BOOK A PILOT →
        </CtaButton>
      </div>
    </SectionFrame>
  );
}
