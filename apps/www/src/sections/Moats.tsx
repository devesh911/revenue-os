import { moats } from "../content/moats";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { MonoLabel } from "../design/MonoLabel";
import { SectionFrame } from "../design/SectionFrame";
import { Text } from "../design/Text";
import { cx } from "../lib/cx";

// The three competitive moats — a centred head over a three-up card grid, each card
// a gradient "media" plate above kicker/title/copy. Folds 3 → 1 below 980.
const GRAD: Record<"a" | "b" | "c", string> = {
  a: "bg-moat-a",
  b: "bg-moat-b",
  c: "bg-moat-c",
};

export function Moats() {
  return (
    <SectionFrame id="moats">
      <div className="px-[60px] pt-[72px] pb-[56px] text-center max-[680px]:px-[22px] max-[680px]:pt-[48px] max-[680px]:pb-[38px]">
        <Kicker className="mb-[20px]">PLOT 02 — WHY THIS SURVIVES</Kicker>
        <Heading className="text-[clamp(30px,3.4vw,48px)] tracking-[0.02em]">
          THREE COMPETITORS, THREE MOATS
        </Heading>
      </div>
      <div className="grid grid-cols-3 border-t border-hairline-18 max-[980px]:grid-cols-1">
        {moats.map((moat) => (
          <div
            key={moat.title}
            className="flex flex-col border-r border-hairline-12 last:border-r-0 max-[980px]:border-r-0 max-[980px]:border-b max-[980px]:border-hairline-12 max-[980px]:last:border-b-0"
          >
            <div className="relative h-[220px] overflow-hidden border-b border-hairline-12 bg-ground">
              <div className={cx("absolute inset-0", GRAD[moat.grad])} />
            </div>
            <div className="flex flex-col gap-[14px] px-[34px] pt-[34px] pb-[44px]">
              <MonoLabel className="text-[11.5px] tracking-[0.26em] text-cream-50">
                {moat.kicker}
              </MonoLabel>
              <Heading as="div" className="text-[26px]">
                {moat.title}
              </Heading>
              <Text className="text-[15px] leading-[1.7] text-cream-68">
                {moat.copy}
              </Text>
            </div>
          </div>
        ))}
      </div>
    </SectionFrame>
  );
}
