import { workflow } from "../content/workflow";
import { Heading } from "../design/Heading";
import { MonoLabel } from "../design/MonoLabel";
import { Text } from "../design/Text";
import { cx } from "../lib/cx";
import { reveal } from "../lib/reveal";

// The route out of step 02 for buyers still exploring, closing the ink panel: the
// olive follow-up loop, with its example plan. (The other route — ready buyers,
// clay — is step 03's booked visit, so it needs no card of its own.) The glyph is
// drawn in the FunnelFlow vocabulary (the dotted loop with a lead on it), so the
// card reads as the diagram's legend. The words sit left and the plan right from
// md; they stack on phones. The olive label is lifted 8% toward paper (as is the
// diagram's loop label): plain olive holds only ~4.5:1 on the card's fill over the
// panel grain; this holds 5:1.
const { followUp } = workflow;
const CAPS = "text-[11px] uppercase tracking-[0.1em]";

export function IntentRouting({ className }: { className?: string }) {
  return (
    <article
      {...reveal()}
      className={cx(
        "grid gap-[28px] rounded-[20px] border border-paper/10 bg-paper/[0.02] p-[28px] md:grid-cols-2 md:gap-x-[56px] md:p-[32px]",
        className,
      )}
    >
      <div className="flex items-center justify-between text-olive-lift md:col-span-2">
        <MonoLabel className="text-[11.5px] uppercase tracking-[0.12em]">
          <span aria-hidden="true" className="font-sans text-[12px]">
            {followUp.arrow}
          </span>{" "}
          {followUp.tag}
        </MonoLabel>
        <svg
          viewBox="0 0 48 22"
          fill="none"
          aria-hidden="true"
          className="h-[22px] w-[48px] stroke-current"
        >
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
        </svg>
      </div>
      <div>
        <Heading as="h3">{followUp.title}</Heading>
        <Text tone="inverse-strong" className="mt-[10px] max-w-[46ch]">
          {followUp.body}
        </Text>
      </div>
      <div>
        <MonoLabel
          id="follow-up-plan"
          className={cx(CAPS, "block text-paper/50")}
        >
          {followUp.label}
        </MonoLabel>
        <ol aria-labelledby="follow-up-plan" className="mt-[12px]">
          {followUp.plan.map((step) => (
            <li
              key={step.when}
              className="grid grid-cols-[72px_1fr] gap-[12px] border-paper/10 border-t py-[12px] last:pb-0"
            >
              <MonoLabel className={cx(CAPS, "pt-[3px] text-paper/70")}>
                {step.when}
              </MonoLabel>
              <span className="text-pretty text-[15px] text-paper/85 leading-[1.5]">
                {step.what}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </article>
  );
}
