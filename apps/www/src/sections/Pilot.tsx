import { pilot } from "../content/pilot";
import { Card } from "../design/Card";
import { Heading } from "../design/Heading";
import { Label } from "../design/Label";
import { Section } from "../design/Section";
import { Text } from "../design/Text";
import { BookDemoButton } from "../lib/bookingContext";
import { cx } from "../lib/cx";
import { CHECK, CHEVRON, Icon } from "../visuals/Icon";

// The four-week pilot, laid out to support the demo decision: one quiet card of
// four facts (a term beside its answer from md, stacked below, hairlines between),
// then how fees work — in words, since rates are agreed per project — with the demo
// button right after it, where the decision happens. The plans sit behind a native
// <details> so they stay secondary: nothing is preselected and nothing reads as
// checkout. A check marks only what exists today; roadmap items sit under
// "Planned", quieter and unchecked. Only hovering the summary lights its chevron.
// The fact terms are <dt>s (a <dt> can't hold a heading), set in the card size.
const TERM =
  "text-balance font-semibold text-[18px] text-ink leading-[1.35] tracking-[-0.01em] md:text-[19px]";
const ITEM = "text-[15px] leading-[1.5]";

export function Pilot() {
  const { facts, fees, compare } = pilot;
  return (
    <Section id="pilot" aria-labelledby="pilot-title">
      <div className="max-w-[640px]">
        <Heading id="pilot-title">{pilot.title}</Heading>
        <Text tone="muted" className="mt-[12px]">
          {pilot.intro}
        </Text>
      </div>

      <Card className="mt-[32px] px-[22px] md:mt-[40px] md:px-[32px]">
        <dl>
          {facts.map((fact) => (
            <div
              key={fact.title}
              className="border-line border-t py-[20px] first:border-t-0 md:grid md:grid-cols-[180px_minmax(0,1fr)] md:items-baseline md:gap-x-[32px] md:py-[24px] lg:grid-cols-[240px_minmax(0,680px)]"
            >
              <dt className={TERM}>{fact.title}</dt>
              <dd className="mt-[6px] md:mt-0">
                <Text tone="muted">{fact.body}</Text>
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="mt-[32px] max-w-[640px] md:mt-[40px]">
        <Heading as="h3">{fees.title}</Heading>
        <Text tone="muted" className="mt-[8px]">
          {fees.body}
        </Text>
        <BookDemoButton source="pilot" className="mt-[24px]" />
      </div>

      <details className="group mt-[40px] border-line border-y md:mt-[48px]">
        <summary className="group/summary flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-[16px] font-medium text-[16px] text-ink [&::-webkit-details-marker]:hidden">
          {compare.summary}
          <Icon
            d={CHEVRON}
            className="size-[16px] shrink-0 text-ink-2 transition duration-200 group-open:rotate-180 group-hover/summary:text-ink"
          />
        </summary>
        <ul className="grid gap-[28px] pt-[8px] pb-[32px] md:grid-cols-3 md:gap-[24px] lg:gap-[32px]">
          {compare.plans.map((plan, i) => (
            <li key={plan.name}>
              <h3 className="font-semibold text-[16px] text-ink tracking-[-0.01em]">
                {plan.name}
              </h3>
              <Label className="mt-[2px] block">{plan.price}</Label>
              <ul className="mt-[14px] flex flex-col gap-[8px]">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className={cx("flex gap-[10px] text-ink", ITEM)}
                  >
                    <Icon
                      d={CHECK}
                      className="mt-[3px] size-[16px] shrink-0 text-ink-2"
                    />
                    {feature}
                  </li>
                ))}
              </ul>
              {plan.planned.length > 0 && (
                <>
                  <Label id={`plan-${i}-planned`} className="mt-[18px] block">
                    {compare.plannedLabel}
                  </Label>
                  <ul
                    aria-labelledby={`plan-${i}-planned`}
                    className="mt-[6px] flex flex-col gap-[6px] pl-[26px]"
                  >
                    {plan.planned.map((item) => (
                      <li key={item} className={cx("text-ink-2", ITEM)}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </li>
          ))}
        </ul>
      </details>
    </Section>
  );
}
