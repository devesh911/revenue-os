import { useId } from "react";
import { howItWorks } from "../content/beforeCall";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { MonoLabel } from "../design/MonoLabel";
import { SectionFrame } from "../design/SectionFrame";
import { Text } from "../design/Text";
import { reveal } from "../lib/reveal";
import { HowSteps } from "../visuals/HowSteps";

// How it works, told as one enquiry: the intro (the kicker with its "Illustrative
// example" tag, the headline with its accent words, the lede), then five steps
// beside a product window that plays the call brief and the intent study
// (HowSteps). Intent scoring and questions to the sales team are planned, so the tag
// sits in the kicker row and again on the window. The engine panel after it is
// "The call and after" (StageGrid).

// The title with its accent words in clay: the same serif and weight, colour only
// (never italic). Punctuation stays outside the spans, in ink.
const ACCENT = new RegExp(`(${howItWorks.accents.join("|")})`);
const accented = howItWorks.title.split(ACCENT).map((part, i) =>
  i % 2 ? (
    <span key={part} className="text-clay-type">
      {part}
    </span>
  ) : (
    part
  ),
);

export function HowItWorks() {
  const title = useId();
  return (
    <SectionFrame id="how" aria-labelledby={title}>
      <div {...reveal()} className="max-w-[760px]">
        <div className="flex flex-wrap items-center gap-x-[14px] gap-y-[10px]">
          <Kicker>{howItWorks.kicker}</Kicker>
          <MonoLabel className="inline-flex rounded-full border border-line px-[10px] py-[5px] text-[11px] text-stone uppercase tracking-[0.1em]">
            {howItWorks.illustrative}
          </MonoLabel>
        </div>
        <Heading id={title} className="mt-[20px]">
          {accented}
        </Heading>
        <Text size="lede" className="mt-[20px] max-w-[56ch]">
          {howItWorks.sub}
        </Text>
      </div>
      <HowSteps />
    </SectionFrame>
  );
}
