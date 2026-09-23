import { engineHead, stages } from "../content/stages";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { MonoLabel } from "../design/MonoLabel";
import { SectionFrame } from "../design/SectionFrame";
import { Text } from "../design/Text";
import { reveal } from "../lib/reveal";
import { FunnelFlow } from "../visuals/FunnelFlow";
import { IntentRouting } from "./IntentRouting";

// "How it works" — the dark engine panel: the head (split on desktop, the intro
// starting on the third column's edge), the animated funnel flow, the four stages
// in hairline columns under its nodes, then the intent split. Stages read as a
// railed sequence on phones, 2-up on tablets, four columns on desktop.
export function StageGrid() {
  return (
    <SectionFrame id="how" tone="ink">
      <div
        {...reveal()}
        className="grid gap-[24px] lg:grid-cols-2 lg:items-end lg:gap-0"
      >
        <div>
          <Kicker tone="inverse" className="mb-[24px]">
            {engineHead.kicker}
          </Kicker>
          <Heading>{engineHead.heading}</Heading>
        </div>
        <Text size="lede" className="max-w-[46ch] text-paper/70 lg:pl-[28px]">
          {engineHead.intro}
        </Text>
      </div>
      <FunnelFlow className="mt-[72px]" />
      <ol className="m-0 mt-[56px] grid list-none gap-y-[40px] p-0 md:mt-[64px] md:grid-cols-2 md:gap-y-[56px] lg:mt-[40px] lg:grid-cols-4">
        {stages.map((s, i) => (
          <li
            key={s.num}
            {...reveal(120 + i * 90)}
            className="relative border-paper/10 pl-[32px] md:pr-[28px] md:pl-0 md:even:border-l md:even:pl-[28px] lg:border-l lg:pl-[28px] lg:first:border-l-0 lg:first:pl-0"
          >
            <span
              aria-hidden="true"
              className="absolute top-[5px] left-0 size-[9px] rounded-full bg-clay md:hidden"
            />
            {i < stages.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute top-[22px] -bottom-[37px] left-[4px] w-px bg-paper/15 md:hidden"
              />
            )}
            <MonoLabel className="flex gap-[12px] whitespace-nowrap text-[11.5px] tracking-[0.12em]">
              <span className="text-paper">{s.num}</span>
              <span className="text-paper/50">{s.kicker}</span>
            </MonoLabel>
            <Heading as="h3" size="card" className="mt-[18px]">
              {s.title}
            </Heading>
            <Text className="mt-[12px] text-paper/70">{s.copy}</Text>
          </li>
        ))}
      </ol>
      <IntentRouting className="mt-[72px] md:mt-[96px]" />
    </SectionFrame>
  );
}
