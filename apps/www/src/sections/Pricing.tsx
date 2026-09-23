import { useState } from "react";
import { flushSync } from "react-dom";
import {
  choosePlanLabel,
  defaultPlanId,
  plans,
  pricingCopy,
} from "../content/plans";
import { CtaButton } from "../design/CtaButton";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { SectionFrame } from "../design/SectionFrame";
import { Text } from "../design/Text";
import { cx } from "../lib/cx";
import { reveal } from "../lib/reveal";
import { CHECK, Icon, INFO } from "../visuals/Icon";

// Pricing — a centred head over three plan cards on the wash panel. Exactly one plan
// is selected (default = funnel, the SSR pin): it takes the ink border and the
// page's soft lift, fills its radio with clay and offers its own CTA. The others
// offer "Choose plan", whose hit area stretches over the whole card (the radio reads
// as clickable, so the card is). The outer <li> carries the data-plan /
// data-selected hooks. Choosing a plan swaps that button for a link, so focus is
// handed to the new CTA instead of dropping to <body>. On lg the cards share five
// subgrid rows, so a blurb that wraps pushes every price and hairline down together.
// In forced-colours mode (where borders and fills go system-colour) the selected
// card keeps a heavier border and its radio dot a system-colour fill.
const SUBGRID = "lg:row-span-5 lg:grid lg:grid-rows-subgrid";
// The swapped-in CTA fades in — except under the page-wide pause, where a frozen
// first keyframe would leave it (and the focus handed to it) invisible.
const ENTER =
  "animate-[ro-fade_400ms_var(--ease-soft)] [html[data-still]_&]:animate-none";

export function Pricing() {
  const [selected, setSelected] = useState(defaultPlanId);
  return (
    <SectionFrame id="pricing" tone="wash">
      <div {...reveal()} className="mx-auto max-w-[720px] text-center">
        <Kicker className="justify-center">{pricingCopy.kicker}</Kicker>
        <Heading className="mt-[20px]">{pricingCopy.title}</Heading>
        <Text size="lede" className="mx-auto mt-[20px] max-w-[54ch]">
          {pricingCopy.sub}
        </Text>
      </div>
      <ul className="mx-auto mt-[56px] grid max-w-[520px] gap-[20px] md:mt-[72px] lg:max-w-none lg:grid-cols-3 lg:gap-y-0">
        {plans.map((plan, i) => {
          const isSelected = plan.id === selected;
          return (
            <li
              key={plan.id}
              data-plan={plan.id}
              data-selected={isSelected ? "true" : "false"}
              {...reveal(100 + i * 90)}
              className={cx("flex", SUBGRID)}
            >
              <article
                className={cx(
                  "relative flex flex-1 flex-col rounded-[24px] border bg-paper p-[28px] transition-[border-color,box-shadow] duration-300 ease-[var(--ease-soft)]",
                  SUBGRID,
                  isSelected
                    ? "border-ink shadow-lift forced-colors:border-[3px]"
                    : "border-line hover:border-ink/25",
                )}
              >
                <div className="flex items-center justify-between gap-[16px]">
                  <Heading as="h3">{plan.name}</Heading>
                  <span
                    aria-hidden="true"
                    className={cx(
                      "grid size-[20px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors duration-300 ease-[var(--ease-soft)]",
                      isSelected ? "border-ink" : "border-ink/20",
                    )}
                  >
                    <span
                      className={cx(
                        "size-[8px] rounded-full bg-clay transition-transform duration-300 ease-[var(--ease-soft)] forced-colors:bg-[CanvasText]",
                        isSelected ? "scale-100" : "scale-0",
                      )}
                    />
                  </span>
                  {isSelected ? (
                    <span className="sr-only">{pricingCopy.selectedHint}</span>
                  ) : null}
                </div>
                <Text size="small" tone="muted" className="mt-[6px]">
                  {plan.blurb}
                </Text>
                <p className="mt-[28px] flex items-baseline gap-[8px]">
                  <span className="font-serif text-[48px] leading-none tracking-[-0.03em]">
                    {plan.price}
                  </span>
                  {plan.priceSub ? (
                    <span className="text-[15px] text-stone">
                      {plan.priceSub}
                    </span>
                  ) : null}
                </p>
                <ul className="mt-[28px] flex flex-col gap-[12px] border-line border-t pt-[24px]">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-[12px] text-[15px] text-ink-2 leading-[1.5]"
                    >
                      <Icon
                        d={CHECK}
                        className="mt-[3px] size-[16px] shrink-0 text-olive-deep"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-[36px]">
                  {isSelected ? (
                    <CtaButton
                      variant="accent"
                      arrow
                      href="#cta"
                      className={cx("w-full", ENTER)}
                    >
                      {plan.cta}
                    </CtaButton>
                  ) : (
                    <CtaButton
                      variant="ghost"
                      className={cx(
                        "w-full after:absolute after:inset-0 after:rounded-[24px]",
                        ENTER,
                      )}
                      onClick={(e) => {
                        const card = e.currentTarget.closest("article");
                        flushSync(() => setSelected(plan.id));
                        card?.querySelector("a")?.focus();
                      }}
                    >
                      {choosePlanLabel}
                      <span className="sr-only"> {plan.name}</span>
                    </CtaButton>
                  )}
                </div>
              </article>
            </li>
          );
        })}
      </ul>
      <Text size="small" tone="muted" className="mt-[40px] text-center">
        <Icon
          d={INFO}
          className="mr-[8px] inline-block size-[15px] align-[-3px]"
        />
        {pricingCopy.footnote}
      </Text>
    </SectionFrame>
  );
}
