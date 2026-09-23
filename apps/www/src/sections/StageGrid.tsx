import { engineHead, stages } from "../content/stages";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { MonoLabel } from "../design/MonoLabel";
import { SectionFrame } from "../design/SectionFrame";
import { Text } from "../design/Text";
import { reveal } from "../lib/reveal";
import { FunnelFlow } from "../visuals/FunnelFlow";
import { IntentRouting } from "./IntentRouting";

// "How it works" — the dark engine panel: the head (split from lg, the intro
// starting on the text edge of the stage column below it), the animated funnel
// flow, the four stages, then the intent split. Stages read as a railed sequence
// on phones and 2×2 from md, with the flow standing well apart above them as its
// own figure; from xl they run as four equal columns on 56px gutters (a hairline
// centred in each), tucked right under the flow's nodes — FunnelFlow shares that
// geometry, so each node sits over its column's centre.
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
        <Text size="lede" tone="inverse" className="max-w-[46ch] lg:pl-[28px]">
          {engineHead.intro}
        </Text>
      </div>
      <FunnelFlow className="mt-[72px]" />
      <ol className="mt-[56px] grid gap-y-[40px] md:mt-[96px] md:grid-cols-2 md:gap-x-[56px] md:gap-y-[56px] xl:mt-[40px] xl:grid-cols-4">
        {stages.map((s, i) => (
          <li
            key={s.num}
            {...reveal(120 + i * 90)}
            className="relative pl-[32px] before:absolute before:inset-y-0 before:-left-[28px] before:hidden before:w-px before:bg-paper/10 md:pl-0 md:even:before:block xl:not-first:before:block"
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
            <Heading as="h3" className="mt-[18px]">
              {s.title}
            </Heading>
            <Text tone="inverse" className="mt-[12px]">
              {s.copy}
            </Text>
          </li>
        ))}
      </ol>
      <IntentRouting className="mt-[72px] md:mt-[96px]" />
    </SectionFrame>
  );
}
