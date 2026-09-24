import { hero, result } from "../content/hero";
import { motionToggle } from "../content/site";
import { Heading } from "../design/Heading";
import { MonoLabel } from "../design/MonoLabel";
import { SectionFrame } from "../design/SectionFrame";
import { Text } from "../design/Text";
import { BookDemoButton } from "../lib/bookingContext";
import { setStill, useStill } from "../lib/motion";
import { reveal } from "../lib/reveal";
import { CHECK, Icon, PAUSE, PLAY } from "../visuals/Icon";
import { SampleAudio } from "../visuals/SampleAudio";
import { SurveyGround, SurveyPlan } from "../visuals/SurveyGround";

// The hook, on an architect's drawing sheet (SurveyGround): eyebrow · the page's
// single <h1> · lede · the demo button and the sample-call listen button (its
// honesty note beneath), then the page-wide pause switch (WCAG 2.2.2: it freezes
// every loop on the page and finishes the plan's plot; under reduced motion there
// is nothing to pause, so it hides). Beside the copy lies the plan of the flat
// (SurveyPlan) with the result card on it, tilted: one enquiry, called 2 min after
// import, qualified, a site visit booked — an illustration of the outcome, not a
// live call, and one labelled image to a screen reader. From lg the plan takes a
// fixed column (--survey-plan, styles.css) and the copy centres on it; stacked, the
// plan follows the copy, centred; phones drop the plan and keep the card.

export function Hero() {
  const still = useStill();
  return (
    <div className="survey relative isolate">
      <SurveyGround />
      <SectionFrame
        flush
        className="grid gap-y-[48px] pt-[48px] pb-[100px] sm:gap-y-[88px] sm:pb-[112px] md:pt-[72px] lg:grid-cols-[minmax(0,1fr)_var(--survey-plan)] lg:items-center lg:gap-x-[48px] lg:pt-[76px] lg:pb-[88px]"
      >
        <div className="flex flex-col items-start">
          <MonoLabel
            className="text-[11.5px] text-stone uppercase tracking-[0.12em]"
            {...reveal(0)}
          >
            {hero.eyebrow}
          </MonoLabel>
          <Heading level={1} className="mt-[28px]" {...reveal(80)}>
            {hero.title}
          </Heading>
          <Text
            size="lede"
            className="mt-[24px] max-w-[36rem]"
            {...reveal(160)}
          >
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
          <button
            type="button"
            onClick={() => setStill(!still)}
            className="-ml-[10px] mt-[6px] inline-flex min-h-[44px] cursor-pointer items-center gap-[7px] whitespace-nowrap rounded-full px-[10px] font-mono text-[11px] text-stone transition-colors duration-200 hover:text-ink motion-reduce:hidden"
            {...reveal(280)}
          >
            <Icon d={still ? PLAY : PAUSE} className="size-[10px]" />
            {still ? motionToggle.play : motionToggle.pause}
          </button>
        </div>
        <figure className="relative grid justify-items-start sm:mx-auto sm:aspect-[4/5] sm:w-(--survey-plan) sm:place-items-center lg:mx-0">
          <SurveyPlan className="max-sm:hidden" />
          <div
            className="w-full max-w-[400px] sm:w-[max(82%,340px)]"
            {...reveal(200)}
          >
            <div
              role="img"
              aria-label={result.aria}
              className="grid rotate-[-1.6deg] gap-[10px] rounded-[18px] border border-line bg-card px-[18px] py-[16px] shadow-lift"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-[10px] gap-y-[2px]">
                <span className="font-semibold text-[15.5px] text-ink">
                  {result.lead}
                </span>
                <MonoLabel className="whitespace-nowrap text-[12px] text-stone">
                  {result.called}
                </MonoLabel>
              </div>
              <MonoLabel className="text-[11px] text-stone uppercase tracking-[0.12em]">
                {result.captured}
              </MonoLabel>
              <div className="flex flex-wrap gap-[6px]">
                {result.fields.map((f) => (
                  <MonoLabel
                    key={f}
                    className="rounded-full bg-paper-2 px-[9px] py-[6px] text-[12px] text-ink-2 leading-none"
                  >
                    {f}
                  </MonoLabel>
                ))}
              </div>
              <div className="flex items-center gap-[8px] border-line border-t pt-[11px] font-medium text-[14px] text-olive-deep">
                <Icon d={CHECK} className="size-[15px] shrink-0" />
                {result.outcome}
              </div>
            </div>
          </div>
        </figure>
      </SectionFrame>
    </div>
  );
}
