import { type ReactNode, useId } from "react";
import { chapters, howItWorks } from "../content/beforeCall";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { MonoLabel } from "../design/MonoLabel";
import { SectionFrame } from "../design/SectionFrame";
import { Text } from "../design/Text";
import { reveal } from "../lib/reveal";
import { CallBrief } from "../visuals/CallBrief";
import { IntentEvidence } from "../visuals/IntentEvidence";

// How it works, in the order one enquiry lives it: the intro, then chapter 01 —
// before the call, the brief assembles (CallBrief) — and chapter 02 — who to call
// first, the score worked out (IntentEvidence). Each chapter's message sits directly
// above the visual that shows it. Chapter 03, the call and after, is the dark engine
// panel that follows (StageGrid). Chapters 01 and 02 carry "Illustrative example":
// intent scoring and questions to the sales team are planned.
export function HowItWorks() {
  const title = useId();
  return (
    <SectionFrame id="how" aria-labelledby={title}>
      <div {...reveal()} className="max-w-[760px]">
        <Kicker>{howItWorks.kicker}</Kicker>
        <Heading id={title} className="mt-[20px]">
          {howItWorks.title}
        </Heading>
        <Text size="lede" className="mt-[20px] max-w-[56ch]">
          {howItWorks.sub}
        </Text>
      </div>
      <Chapter {...chapters.context} className="mt-[72px] md:mt-[96px]">
        <CallBrief />
      </Chapter>
      <Chapter {...chapters.intent} className="mt-[88px] md:mt-[120px]">
        <IntentEvidence />
      </Chapter>
    </SectionFrame>
  );
}

function Chapter({
  step,
  kicker,
  title,
  sub,
  className,
  children,
}: {
  step: string;
  kicker: string;
  title: string;
  sub: string;
  className: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={className}>
      <div {...reveal()} className="max-w-[720px]">
        <div className="flex flex-wrap items-center gap-x-[14px] gap-y-[10px]">
          <Kicker>
            {step} · {kicker}
          </Kicker>
          <MonoLabel className="inline-flex rounded-full border border-line px-[10px] py-[5px] text-[11px] text-stone uppercase tracking-[0.1em]">
            {howItWorks.illustrative}
          </MonoLabel>
        </div>
        <Heading as="h3" size="section" id={id} className="mt-[18px]">
          {title}
        </Heading>
        <Text className="mt-[16px] max-w-[56ch]">{sub}</Text>
      </div>
      <div className="mt-[40px] md:mt-[48px]">{children}</div>
    </section>
  );
}
