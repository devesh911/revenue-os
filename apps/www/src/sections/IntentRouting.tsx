import { intents } from "../content/stages";
import { MonoLabel } from "../design/MonoLabel";
import { SectionFrame } from "../design/SectionFrame";
import { Text } from "../design/Text";
import { cx } from "../lib/cx";

// The intent split beneath the funnel stages: low intent (teal) → nurture loop,
// high intent (gold) → human closer. Two cells side by side, stacking below 680.
export function IntentRouting() {
  return (
    <SectionFrame className="grid grid-cols-2 max-[680px]:grid-cols-1">
      {intents.map((intent, i) => (
        <div
          key={intent.label}
          className={cx(
            "flex items-baseline gap-[16px] px-[34px] py-[30px]",
            i === 0 &&
              "border-r border-hairline-12 max-[680px]:border-r-0 max-[680px]:border-b max-[680px]:border-hairline-12",
          )}
        >
          <MonoLabel
            className={cx(
              "shrink-0 text-[11.5px] tracking-[0.24em]",
              intent.tone === "low" ? "text-intent-teal" : "text-gold",
            )}
          >
            {intent.arrow} {intent.label}
          </MonoLabel>
          <Text as="span" className="text-[15px] text-cream-65">
            {intent.copy}
          </Text>
        </div>
      ))}
    </SectionFrame>
  );
}
