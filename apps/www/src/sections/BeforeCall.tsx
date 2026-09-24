import { useId } from "react";
import { beforeCall } from "../content/beforeCall";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { MonoLabel } from "../design/MonoLabel";
import { SectionFrame } from "../design/SectionFrame";
import { Text } from "../design/Text";
import { reveal } from "../lib/reveal";
import { CallBrief } from "../visuals/CallBrief";
import { IntentEvidence } from "../visuals/IntentEvidence";

// "Before the call", after How it works: a zoom into what Revenue OS does between an
// imported enquiry and the first ring. The head (kicker, heading, sub, and the
// "Illustrative example" tag — intent scoring and sales-team questions are planned),
// then the two studies in story order: why Rohan scores 78 (IntentEvidence), then
// the call brief that assembles itself, Priya's answer included (CallBrief).
export function BeforeCall() {
  const title = useId();
  return (
    <SectionFrame id="before-the-call" aria-labelledby={title}>
      <div {...reveal()} className="max-w-[720px]">
        <Kicker>{beforeCall.kicker}</Kicker>
        <Heading id={title} className="mt-[20px]">
          {beforeCall.title}
        </Heading>
        <Text className="mt-[20px] max-w-[56ch]">{beforeCall.sub}</Text>
        <MonoLabel className="mt-[20px] inline-flex rounded-full border border-line px-[10px] py-[5px] text-[11px] text-stone uppercase tracking-[0.1em]">
          {beforeCall.illustrative}
        </MonoLabel>
      </div>
      <div className="mt-[56px] grid gap-[40px] md:mt-[72px] md:gap-[56px]">
        <IntentEvidence />
        <CallBrief />
      </div>
    </SectionFrame>
  );
}
