import type { ReactNode } from "react";
import { workflow } from "../content/workflow";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { MonoLabel } from "../design/MonoLabel";
import { SectionFrame } from "../design/SectionFrame";
import { Text } from "../design/Text";
import { cx } from "../lib/cx";
import { reveal } from "../lib/reveal";
import { FunnelFlow } from "../visuals/FunnelFlow";
import { CHECK, Icon } from "../visuals/Icon";
import { IntentRouting } from "./IntentRouting";

// "How it works" — the dark engine panel: the head (split from lg, the intro
// starting on the text edge of the step column below it), the animated funnel
// flow, the three steps, then the follow-up branch. Steps read as a railed
// sequence on phones; at md the first two sit side by side and the third turns
// landscape across both columns (words left, example right) so the 2 + 1 split
// reads as deliberate, with the flow standing well apart above them as its own
// figure; from lg they run as three equal columns on 56px gutters (a hairline
// centred in each), tucked right under the flow's nodes — FunnelFlow shares that
// geometry, so each node sits over its column's centre. Each step closes on a
// small product example, one lead followed from import to a booked visit, in the
// hero card's vocabulary (mono caps for machine data, serif for the outcome, clay
// for the call and the visit). From lg the steps share two subgrid rows, so the
// examples start level and end level however the copy wraps.
const [respond, understand, arrange] = workflow.steps;
const BOX =
  "rounded-[16px] border border-paper/10 bg-paper/[0.02] p-[16px] md:p-[18px]";
const CAPS = "text-[11px] uppercase tracking-[0.1em]";

const call = respond.example;
const visit = arrange.example;
const EXAMPLES: ReactNode[] = [
  <div key="call" className={BOX}>
    <MonoLabel className={cx(CAPS, "block text-paper/50")}>
      {call.label} · {call.time}
    </MonoLabel>
    <p className="mt-[10px] text-pretty text-[15px] text-paper/85 leading-[1.5]">
      {call.line}
    </p>
    <MonoLabel className="mt-[14px] inline-block rounded-full border border-clay/40 px-[8px] py-[2px] text-[11px] text-clay">
      {call.status} {call.delay} {call.after}
    </MonoLabel>
  </div>,
  <dl key="fields" className={BOX}>
    {understand.example.fields.map((f) => (
      <div
        key={f.label}
        className="flex items-baseline justify-between gap-[12px] border-paper/10 border-t py-[9px] first:border-t-0 first:pt-0 last:pb-0"
      >
        <dt className="flex items-center gap-[8px] text-paper/50">
          <Icon d={CHECK} className="size-[12px] shrink-0 self-center" />
          <MonoLabel className={CAPS}>{f.label}</MonoLabel>
        </dt>
        <dd className="text-right text-[15px] text-paper/85">{f.value}</dd>
      </div>
    ))}
  </dl>,
  <div key="visit" className={cx(BOX, "flex items-start gap-[14px]")}>
    <span className="grid size-[36px] shrink-0 place-items-center rounded-full bg-clay text-ink">
      <Icon d={CHECK} className="size-[16px]" />
    </span>
    <div className="min-w-0">
      <p className="font-serif text-[18px] text-paper leading-[1.3] tracking-[-0.01em]">
        {visit.label}
      </p>
      <MonoLabel className={cx(CAPS, "mt-[6px] block text-paper/50")}>
        {visit.when}
      </MonoLabel>
      <p className="mt-[2px] text-[14px] text-paper/70 leading-[1.5]">
        {visit.where}
      </p>
    </div>
  </div>,
];

export function StageGrid() {
  return (
    <SectionFrame id="the-call" tone="ink" aria-labelledby="the-call-title">
      <div
        {...reveal()}
        className="grid gap-[24px] lg:grid-cols-2 lg:items-end lg:gap-0"
      >
        <div>
          <Kicker tone="inverse" className="mb-[24px]">
            {workflow.step} · {workflow.kicker}
          </Kicker>
          <Heading as="h3" size="section" id="the-call-title">
            {workflow.title}
          </Heading>
        </div>
        <Text size="lede" tone="inverse" className="max-w-[46ch] lg:pl-[28px]">
          {workflow.intro}
        </Text>
      </div>
      <FunnelFlow className="mt-[72px]" />
      <ol className="mt-[56px] grid gap-y-[40px] md:mt-[96px] md:grid-cols-2 md:gap-x-[56px] md:gap-y-[56px] lg:mt-[40px] lg:grid-cols-3">
        {workflow.steps.map((s, i) => (
          <li
            key={s.tag}
            {...reveal(120 + i * 90)}
            className="relative grid content-start gap-y-[24px] pl-[32px] before:absolute before:inset-y-0 before:-left-[28px] before:hidden before:w-px before:bg-paper/10 md:pl-0 md:even:before:block md:last:col-span-2 md:last:grid-cols-2 md:last:gap-x-[56px] lg:row-span-2 lg:grid-rows-subgrid lg:not-first:before:block lg:last:col-span-1 lg:last:grid-cols-1"
          >
            <span
              aria-hidden="true"
              className="absolute top-[5px] left-0 size-[9px] rounded-full bg-clay md:hidden"
            />
            {i < workflow.steps.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute top-[22px] -bottom-[37px] left-[4px] w-px bg-paper/15 md:hidden"
              />
            )}
            <div>
              <MonoLabel className="flex gap-[12px] whitespace-nowrap text-[11.5px] uppercase tracking-[0.12em]">
                <span className="text-paper/60">{s.tag}</span>
              </MonoLabel>
              <Heading as="h3" className="mt-[18px]">
                {s.title}
              </Heading>
              <Text tone="inverse" className="mt-[12px]">
                {s.body}
              </Text>
            </div>
            {EXAMPLES[i]}
          </li>
        ))}
      </ol>
      <IntentRouting className="mt-[72px] md:mt-[96px]" />
    </SectionFrame>
  );
}
