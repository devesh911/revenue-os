import { hero } from "../content/hero";
import { motionToggle } from "../content/site";
import { CtaButton } from "../design/CtaButton";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { SectionFrame } from "../design/SectionFrame";
import { Text } from "../design/Text";
import { setStill, useStill } from "../lib/motion";
import { reveal } from "../lib/reveal";
import { HeroCall } from "../visuals/HeroCall";
import { Icon, PAUSE, PLAY } from "../visuals/Icon";

// The hook: eyebrow · the page's single <h1> · lede · the two CTAs · a hairline
// row of the three promises — beside the demo call, which shows the product doing
// the work instead of describing it. On lg the copy and promises stack in the left
// column, centred against the card by the two 1fr spacer rows; below lg the card
// follows the CTAs directly and the promises close the section. The greedy wrap
// keeps "operating system" on one line. Blocks rise in on a short stagger.
// Under the card, beside its caption, sits the page-wide pause switch (WCAG
// 2.2.2): it holds the demo call and freezes every other loop on the page; under
// reduced motion there is nothing to pause, so it hides.

export function Hero() {
  const still = useStill();
  return (
    <SectionFrame
      flush
      className="grid gap-y-[56px] pt-[48px] pb-[88px] md:pt-[80px] md:pb-[120px] lg:pt-[64px] lg:grid-cols-[1.05fr_0.95fr] lg:grid-rows-[1fr_auto_auto_1fr] lg:gap-x-[64px] lg:gap-y-0"
    >
      <div className="flex flex-col items-start lg:row-start-2">
        <Kicker tone="hero" {...reveal(0)}>
          <span>
            {hero.kicker.lead}
            <span className="max-sm:hidden">{hero.kicker.tail}</span>
          </span>
        </Kicker>
        <Heading
          level={1}
          balance={false}
          className="mt-[28px]"
          {...reveal(80)}
        >
          {hero.title}
        </Heading>
        <Text size="lede" className="mt-[24px] max-w-[36rem]" {...reveal(160)}>
          {hero.lede}
        </Text>
        <div className="mt-[36px] flex flex-wrap gap-[12px]" {...reveal(240)}>
          <CtaButton
            variant="accent"
            size="lg"
            arrow
            href="#cta"
            className="max-sm:px-[20px]"
          >
            {hero.cta.primary}
          </CtaButton>
          <CtaButton
            variant="ghost"
            size="lg"
            href="#how"
            className="max-sm:px-[20px]"
          >
            {hero.cta.secondary}
          </CtaButton>
        </div>
      </div>
      {/* The switch precedes the figcaption in the DOM (a figcaption must be the
          figure's last child); the grid seats it on the caption's right, on the
          caption's first baseline. The caption's top padding matches the
          switch's, so the row sits the same when reduced motion hides it. */}
      <figure
        className="grid grid-cols-[1fr_auto] items-baseline gap-x-[16px] gap-y-[2px] lg:col-start-2 lg:row-span-4 lg:row-start-1 lg:self-center"
        {...reveal(200)}
      >
        <HeroCall className="col-span-2" />
        <button
          type="button"
          onClick={() => setStill(!still)}
          className="col-start-2 row-start-2 -mr-[10px] inline-flex min-h-[40px] cursor-pointer items-center gap-[7px] whitespace-nowrap rounded-full px-[10px] font-mono text-[11px] text-stone transition-colors duration-200 hover:text-ink motion-reduce:hidden"
        >
          <Icon d={still ? PLAY : PAUSE} className="size-[10px]" />
          {still ? motionToggle.play : motionToggle.pause}
        </button>
        <figcaption className="col-start-1 row-start-2 text-balance pt-[11px] font-mono text-[11px] text-stone leading-[1.6]">
          {hero.caption}
        </figcaption>
      </figure>
      <dl
        className="grid items-start gap-[14px] border-line border-t pt-[22px] sm:grid-cols-3 sm:gap-[28px] lg:row-start-3 lg:mt-[48px]"
        {...reveal(320)}
      >
        {hero.facts.map((f) => (
          <div
            key={f.k}
            className="grid grid-cols-[92px_1fr] items-baseline gap-[12px] sm:grid-cols-1 sm:gap-[6px]"
          >
            <dt className="font-serif text-[22px] text-ink leading-[1.2] tracking-[-0.01em]">
              {f.k}
            </dt>
            <dd className="text-pretty text-[13.5px] text-stone leading-[1.5]">
              {f.v}
            </dd>
          </div>
        ))}
      </dl>
    </SectionFrame>
  );
}
