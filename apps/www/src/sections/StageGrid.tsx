import { stages } from "../content/stages";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { MonoLabel } from "../design/MonoLabel";
import { SectionFrame } from "../design/SectionFrame";
import { Text } from "../design/Text";

// "How it works" — the centred section head over a four-up grid of funnel stages.
// The grid folds 4 → 2 → 1 across the 1100 / 680 breakpoints (preserved verbatim).
export function StageGrid() {
  return (
    <SectionFrame id="how">
      <div className="px-[60px] pt-[72px] pb-[56px] text-center max-[680px]:px-[22px] max-[680px]:pt-[48px] max-[680px]:pb-[38px]">
        <Kicker className="mb-[20px]">PLOT 01 — THE FUNNEL ENGINE</Kicker>
        <Heading className="mb-[18px] text-[clamp(30px,3.4vw,48px)] tracking-[0.02em]">
          FOUR STAGES RUN ON MACHINE TIME
        </Heading>
        <Text className="mx-auto max-w-[62ch] text-[17px] leading-[1.7] text-cream-68">
          A lead enters, the AI works it end to end. High intent routes to a
          human closer; low intent enters the nurture loop. Every outcome
          retrains the scoring model.
        </Text>
      </div>
      <div className="grid grid-cols-4 border-t border-hairline-18 max-[1100px]:grid-cols-2 max-[680px]:grid-cols-1">
        {stages.map((stage) => (
          <div
            key={stage.num}
            className="flex flex-col gap-[14px] border-r border-hairline-12 px-[34px] pt-[38px] pb-[44px] hover:bg-cream-03 max-[1100px]:border-b max-[1100px]:border-hairline-12 max-[1100px]:last:border-b-0 max-[680px]:border-r-0 max-[680px]:px-[24px] max-[680px]:pt-[30px] max-[680px]:pb-[34px]"
          >
            <MonoLabel className="text-[12px] tracking-[0.26em] text-cream-45">
              {stage.num}
            </MonoLabel>
            <Heading as="div" className="text-[26px] tracking-[0.01em]">
              {stage.title}
            </Heading>
            <MonoLabel className="text-[12px] leading-[1.9] tracking-[0.14em] text-cream-50">
              {stage.kicker}
            </MonoLabel>
            <Text className="text-[15px] leading-[1.65] text-cream-68">
              {stage.copy}
            </Text>
          </div>
        ))}
      </div>
    </SectionFrame>
  );
}
