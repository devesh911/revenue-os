import { hero } from "../content/hero";
import { motionToggle } from "../content/site";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { SectionFrame } from "../design/SectionFrame";
import { Text } from "../design/Text";
import { BookDemoButton } from "../lib/bookingContext";
import { setStill, useStill } from "../lib/motion";
import { reveal } from "../lib/reveal";
import { HeroCall } from "../visuals/HeroCall";
import { Icon, PAUSE, PLAY } from "../visuals/Icon";
import { SampleAudio } from "../visuals/SampleAudio";

// The hook: eyebrow · the page's single <h1> · lede · the demo button and the
// sample-call listen button (with its honesty note beneath) — beside the demo
// call, which shows the product doing the work instead of describing it. On lg
// the copy sits in the left column, centred against the card by the two 1fr
// spacer rows; below lg the card follows the buttons. Below sm the two buttons
// grow to fill their row, so when they wrap they stack full-width, not ragged.
// Blocks rise in on a short stagger. Under the card, beside its caption, sits
// the page-wide pause switch (WCAG 2.2.2): it holds the demo call and freezes
// every other loop on the page; under reduced motion there is nothing to pause,
// so it hides.

export function Hero() {
  const still = useStill();
  return (
    <SectionFrame
      flush
      className="grid gap-y-[56px] pt-[48px] pb-[88px] md:pt-[80px] md:pb-[120px] lg:pt-[64px] lg:grid-cols-[1.05fr_0.95fr] lg:grid-rows-[1fr_auto_1fr] lg:gap-x-[64px] lg:gap-y-0"
    >
      <div className="flex flex-col items-start lg:row-start-2">
        <Kicker tone="hero" {...reveal(0)}>
          {hero.eyebrow}
        </Kicker>
        <Heading level={1} className="mt-[28px]" {...reveal(80)}>
          {hero.title}
        </Heading>
        <Text size="lede" className="mt-[24px] max-w-[36rem]" {...reveal(160)}>
          {hero.sub}
        </Text>
        <div className="mt-[36px] flex flex-wrap gap-[12px]" {...reveal(240)}>
          <BookDemoButton
            source="hero"
            size="lg"
            arrow
            className="max-sm:grow max-sm:px-[20px]"
          />
          <SampleAudio className="max-sm:grow max-sm:px-[20px]" />
        </div>
      </div>
      {/* The switch precedes the figcaption in the DOM (a figcaption must be the
          figure's last child); the grid seats it on the caption's right, on the
          caption's first baseline. The caption's top padding matches the
          switch's, so the row sits the same when reduced motion hides it. */}
      <figure
        className="grid grid-cols-[1fr_auto] items-baseline gap-x-[16px] gap-y-[2px] lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-center"
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
    </SectionFrame>
  );
}
