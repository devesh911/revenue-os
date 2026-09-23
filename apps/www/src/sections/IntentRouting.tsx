import { intents } from "../content/stages";
import { Heading } from "../design/Heading";
import { MonoLabel } from "../design/MonoLabel";
import { Text } from "../design/Text";
import { cx } from "../lib/cx";
import { reveal } from "../lib/reveal";

// The two routes out of stage 02, closing the ink panel: low intent (olive) →
// the nurture loop, high intent (clay) → the human closer. Each card's glyph is
// drawn in the FunnelFlow vocabulary (the dotted loop, the line out to the
// closer), so the cards read as the diagram's legend. Stacks on phones. The
// olive label is lifted 8% toward paper (as is the diagram's loop label): plain
// olive holds only ~4.5:1 on the card's fill over the panel grain; this holds 5:1.
const TONE = {
  low: {
    text: "text-olive-lift",
    glyph: (
      <>
        <rect
          x="1"
          y="1"
          width="46"
          height="18"
          rx="9"
          strokeWidth={1.5}
          strokeDasharray="0.5 4"
          strokeLinecap="round"
        />
        <circle cx="17" cy="19" r="3" className="fill-current stroke-none" />
      </>
    ),
  },
  high: {
    text: "text-clay",
    glyph: (
      <>
        <path d="M1 11h46m-6-4.5 6 4.5-6 4.5" />
        <circle cx="17" cy="11" r="3" className="fill-current stroke-none" />
      </>
    ),
  },
} as const;

export function IntentRouting({ className }: { className?: string }) {
  return (
    <div className={cx("grid gap-[16px] md:grid-cols-2", className)}>
      {intents.map((it, i) => (
        <article
          key={it.label}
          {...reveal(i * 100)}
          className="rounded-[20px] border border-paper/10 bg-paper/[0.02] p-[28px] md:p-[32px]"
        >
          <div
            className={cx(
              "flex items-center justify-between",
              TONE[it.tone].text,
            )}
          >
            <MonoLabel className="text-[11.5px] tracking-[0.12em]">
              <span aria-hidden="true" className="font-sans text-[12px]">
                {it.arrow}
              </span>{" "}
              {it.label}
            </MonoLabel>
            <svg
              viewBox="0 0 48 22"
              fill="none"
              aria-hidden="true"
              className="h-[22px] w-[48px] stroke-current"
            >
              {TONE[it.tone].glyph}
            </svg>
          </div>
          <Heading as="h3" className="mt-[28px]">
            {it.title}
          </Heading>
          <Text tone="inverse-strong" className="mt-[10px]">
            {it.copy}
          </Text>
        </article>
      ))}
    </div>
  );
}
