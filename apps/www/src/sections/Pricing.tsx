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

// Pricing — a centred head over three plan cards on the wash band. Exactly one plan
// is selected (default = funnel, the SSR pin): it takes the ink border and the
// section's one soft shadow, fills its radio with clay and offers its own CTA. The
// others offer "Choose plan", whose hit area stretches over the whole card (the
// radio reads as clickable, so the card is). The outer <li> carries the data-plan /
// data-selected hooks. Choosing a plan swaps that button for a link, so focus is
// handed to the new CTA instead of dropping to <body>.
const SELECTED_SHADOW =
  "shadow-[0_1px_2px_rgba(20,20,19,0.04),0_12px_32px_-12px_rgba(20,20,19,0.12)]";

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
      <ul className="mx-auto mt-[56px] grid max-w-[520px] list-none gap-[20px] p-0 md:mt-[72px] lg:max-w-none lg:grid-cols-3">
        {plans.map((plan, i) => {
          const isSelected = plan.id === selected;
          return (
            <li
              key={plan.id}
              data-plan={plan.id}
              data-selected={isSelected ? "true" : "false"}
              {...reveal(100 + i * 90)}
              className="flex"
            >
              <article
                className={cx(
                  "relative flex flex-1 flex-col rounded-[24px] border bg-paper p-[28px] transition-[border-color,box-shadow] duration-300 ease-[var(--ease-soft)]",
                  isSelected
                    ? cx("border-ink", SELECTED_SHADOW)
                    : "border-line hover:border-ink/25",
                )}
              >
                <div className="flex items-center justify-between gap-[16px]">
                  <Heading as="h3" size="card">
                    {plan.name}
                  </Heading>
                  <span
                    aria-hidden="true"
                    className={cx(
                      "grid size-[20px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors duration-300 ease-[var(--ease-soft)]",
                      isSelected ? "border-ink" : "border-ink/20",
                    )}
                  >
                    <span
                      className={cx(
                        "size-[8px] rounded-full bg-clay transition-transform duration-300 ease-[var(--ease-soft)]",
                        isSelected ? "scale-100" : "scale-0",
                      )}
                    />
                  </span>
                  {isSelected ? (
                    <span className="sr-only">{pricingCopy.selectedHint}</span>
                  ) : null}
                </div>
                <Text size="small" className="mt-[6px] text-stone">
                  {plan.blurb}
                </Text>
                <p className="m-0 mt-[28px] flex items-baseline gap-[8px]">
                  <span className="font-serif text-[48px] leading-none tracking-[-0.03em]">
                    {plan.price}
                  </span>
                  {plan.priceSub ? (
                    <span className="text-[15px] text-stone">
                      {plan.priceSub}
                    </span>
                  ) : null}
                </p>
                <ul className="m-0 mt-[28px] flex list-none flex-col gap-[12px] border-line border-t p-0 pt-[24px]">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-[12px] text-[15px] text-ink-2 leading-[1.5]"
                    >
                      <svg
                        viewBox="0 0 16 16"
                        aria-hidden="true"
                        className="mt-[3px] size-[16px] shrink-0 text-olive-deep"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                      </svg>
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
                      className="w-full animate-[ro-fade_400ms_var(--ease-soft)]"
                    >
                      {plan.cta}
                    </CtaButton>
                  ) : (
                    <CtaButton
                      variant="ghost"
                      className="w-full animate-[ro-fade_400ms_var(--ease-soft)] after:absolute after:inset-0 after:rounded-[24px]"
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
      <Text size="small" className="mt-[40px] text-center text-ink-2/80">
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="mr-[8px] inline-block size-[15px] align-[-3px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        >
          <circle cx="8" cy="8" r="6.25" />
          <path d="M8 7.25v4" />
          <circle cx="8" cy="4.9" r="0.5" fill="currentColor" stroke="none" />
        </svg>
        {pricingCopy.footnote}
      </Text>
    </SectionFrame>
  );
}
