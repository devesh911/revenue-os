import type { ReactNode } from "react";
import { workflow } from "../content/workflow";
import { Card } from "../design/Card";
import { Heading } from "../design/Heading";
import { Label } from "../design/Label";
import { Section } from "../design/Section";
import { Text } from "../design/Text";
import { cx } from "../lib/cx";
import { CHECK, Icon } from "../visuals/Icon";

// "How it works": the three steps every enquiry goes through, each with a small
// product example that follows one lead from the enquiry to a booked visit, then
// the follow-up branch for buyers who aren't ready. A hairline runs from each step
// number toward the next — it says "sequence" and is the only connector. On lg
// the steps are columns whose subgrid rows keep titles and examples level however
// the copy wraps; at md each step puts its example beside the words. The branch
// row sits on the same grid under its own hairline, so its plan card lines up
// with the step cards — on lg directly under step 3, whose "or continue following
// up" it expands. Olive marks only success (a captured field, a booked visit);
// mono only real clock times — the call delay reads as one plain phrase, its
// number in the line's own sans (tabular figures). The section follows the proof
// band, whose edge doesn't pad for its neighbour, so the heading block adds the
// other half of the step: a full 56/88 below the band, matching the space above it.
const [respond, understand, arrange] = workflow.steps;
const { followUp } = workflow;
const TIME = "font-mono tabular-nums";

function Step({
  n,
  title,
  body,
  last = false,
  children,
}: {
  n: number;
  title: string;
  body: string;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="grid items-start gap-[14px] md:grid-cols-2 md:gap-x-[32px] lg:row-span-3 lg:grid-cols-1 lg:grid-rows-subgrid lg:items-stretch lg:gap-0">
      <div className="flex items-center gap-[14px] md:col-span-2 lg:col-span-1 lg:mb-[18px]">
        <Label>{n}</Label>
        <span
          aria-hidden="true"
          className={cx("h-px flex-1 bg-line", last && "lg:hidden")}
        />
      </div>
      <div className="lg:mb-[22px]">
        <Heading as="h3">{title}</Heading>
        <Text tone="muted" className="mt-[6px]">
          {body}
        </Text>
      </div>
      <Card tone="product" className="p-[18px]">
        {children}
      </Card>
    </li>
  );
}

export function HowItWorks() {
  const enquiry = respond.example;
  const visit = arrange.example;
  return (
    <Section id="how" aria-labelledby="how-title">
      <div className="max-w-[640px] pt-[28px] md:pt-[44px]">
        <Heading id="how-title">{workflow.title}</Heading>
        <Text tone="muted" className="mt-[12px]">
          {workflow.intro}
        </Text>
      </div>

      <ol className="mt-[40px] grid gap-[40px] md:mt-[48px] lg:grid-cols-3 lg:gap-x-[32px] lg:gap-y-0">
        <Step n={1} title={respond.title} body={respond.body}>
          <p className="flex items-baseline justify-between gap-[12px]">
            <Label>{enquiry.label}</Label>
            <Label mono>{enquiry.time}</Label>
          </p>
          <p className="mt-[6px] text-pretty font-medium text-[16px] text-ink">
            {enquiry.line}
          </p>
          <p className="mt-[14px] border-line border-t pt-[12px] text-[14px] text-ink tabular-nums">
            {enquiry.status} {enquiry.delay} {enquiry.after}
          </p>
        </Step>

        <Step n={2} title={understand.title} body={understand.body}>
          <dl className="grid gap-[12px]">
            {understand.example.fields.map((f) => (
              <div
                key={f.label}
                className="flex items-center justify-between gap-[12px]"
              >
                <dt className="flex items-center gap-[10px] text-[14px] text-ink-2">
                  <Icon
                    d={CHECK}
                    className="size-[16px] shrink-0 text-olive-deep"
                  />
                  {f.label}
                </dt>
                <dd className="text-right font-medium text-[15px] text-ink">
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        </Step>

        <Step n={3} title={arrange.title} body={arrange.body} last>
          <p className="flex items-center gap-[6px] font-medium text-[14px] text-olive-deep">
            <Icon d={CHECK} className="size-[16px] shrink-0" />
            {visit.label}
          </p>
          <p className={cx(TIME, "mt-[10px] text-[15px] text-ink")}>
            {visit.when}
          </p>
          <p className="mt-[2px] font-medium text-[16px] text-ink">
            {visit.where}
          </p>
        </Step>
      </ol>

      <div className="mt-[40px] grid gap-[14px] border-line border-t pt-[24px] md:mt-[56px] md:grid-cols-2 md:gap-x-[32px] lg:grid-cols-3 lg:pt-[28px]">
        <div className="lg:col-span-2">
          <Heading as="h3">{followUp.title}</Heading>
          <Text tone="muted" className="mt-[6px] max-w-[520px]">
            {followUp.body}
          </Text>
        </div>
        <Card tone="product" className="p-[18px]">
          <Label id="follow-up-plan" className="block text-balance">
            {followUp.label}
          </Label>
          <ol aria-labelledby="follow-up-plan" className="mt-[12px]">
            {followUp.plan.map((step) => (
              <li
                key={step.when}
                className="grid grid-cols-[64px_1fr] gap-[12px] border-line border-t py-[12px] last:pb-0"
              >
                <span className="font-medium text-[14px] text-ink leading-[1.5]">
                  {step.when}
                </span>
                <span className="text-pretty text-[15px] text-ink-2 leading-[1.45]">
                  {step.what}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </Section>
  );
}
