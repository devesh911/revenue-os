import { CtaButton } from "../design/CtaButton";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { SectionFrame } from "../design/SectionFrame";
import { Text } from "../design/Text";

// The hero: eyebrow · the single page <h1> · an italic lede · the two primary CTAs.
// A teal radial glow washes down from the top (decorative, pointer-events-none). The
// nbsp keeps "real estate" from breaking across lines, matching the static export.
export function Hero() {
  return (
    <SectionFrame className="relative overflow-hidden px-[60px] pt-[96px] pb-[84px] text-center max-[680px]:px-[22px] max-[680px]:pt-[56px] max-[680px]:pb-[52px]">
      <div className="bg-hero-glow pointer-events-none absolute inset-0" />
      <div className="relative flex flex-col items-center gap-[28px]">
        <Kicker tone="hero">
          VOICE AI · INDIAN REAL ESTATE · PRICED ON OUTCOMES
        </Kicker>
        <Heading
          level={1}
          className="max-w-[19ch] text-[clamp(44px,5.6vw,84px)] leading-[1.04] tracking-[0.005em] max-[680px]:text-[38px]"
        >
          {"The revenue operating system for Indian real estate."}
        </Heading>
        <Text className="max-w-[56ch] text-[19px] italic leading-[1.7] text-cream-72">
          Voice agents are the front door. The product is the funnel — every
          conversation feeds the machine that decides who gets called next, and
          a human is inserted only when a human changes the outcome.
        </Text>
        <div className="mt-[14px] flex gap-[16px] max-[680px]:flex-wrap max-[680px]:justify-center">
          <CtaButton
            variant="accent"
            href="#cta"
            className="px-[34px] py-[17px] font-mono text-[14px] tracking-[0.2em]"
          >
            RUN OUR PILOT
          </CtaButton>
          <CtaButton
            variant="ghost"
            href="#how"
            className="px-[34px] py-[16px] font-mono text-[14px] tracking-[0.2em]"
          >
            SEE THE ENGINE
          </CtaButton>
        </div>
      </div>
    </SectionFrame>
  );
}
