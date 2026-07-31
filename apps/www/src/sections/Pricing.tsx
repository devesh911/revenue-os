import { useState } from "react";
import { choosePlanLabel, defaultPlanId, plans } from "../content/plans";
import { CtaButton } from "../design/CtaButton";
import { Heading } from "../design/Heading";
import { MonoLabel } from "../design/MonoLabel";
import { SectionFrame } from "../design/SectionFrame";
import { Text } from "../design/Text";
import { cx } from "../lib/cx";

// Pricing — three plan cards over a gradient plate. Exactly one is selected (default
// = funnel, the SSR pin): the selected card shows a gold border, a filled radio, and
// its subscribe CTA; the others show a hairline border, a hollow radio, and CHOOSE
// PLAN. Selecting a plan (its CHOOSE PLAN button) promotes it — the data-plan /
// data-selected hooks make that state machine-checkable. Folds 3 → 1 below 980.
const GRAD: Record<"a" | "b" | "c", string> = {
  a: "bg-plan-a",
  b: "bg-plan-b",
  c: "bg-plan-c",
};

const PLAN_CTA_CLS =
  "block w-full px-[24px] py-[16px] text-left font-mono text-[13.5px] tracking-[0.24em]";

export function Pricing() {
  const [selected, setSelected] = useState(defaultPlanId);
  return (
    <SectionFrame id="pricing">
      <div className="px-[60px] pt-[72px] pb-[24px] text-center max-[680px]:px-[22px] max-[680px]:pt-[48px] max-[680px]:pb-[12px]">
        <Heading className="mb-[20px] text-[clamp(30px,3.4vw,48px)] tracking-[0.06em]">
          CHOOSE A PLAN TO CONNECT REVENUE OS
        </Heading>
        <Text className="mx-auto max-w-[56ch] text-[17px] leading-[1.75] text-cream-68">
          All tiers run the full funnel engine — voice + WhatsApp agents,
          <br />
          intent scoring, and outcome-based pricing on qualified site visits.
        </Text>
      </div>
      <div className="grid grid-cols-3 gap-[26px] px-[28px] pt-[36px] pb-[40px] max-[980px]:mx-auto max-[980px]:max-w-[560px] max-[980px]:grid-cols-1 max-[680px]:px-[16px]">
        {plans.map((plan) => {
          const isSelected = plan.id === selected;
          return (
            <div
              key={plan.id}
              data-plan={plan.id}
              data-selected={isSelected ? "true" : "false"}
              className="flex flex-col gap-[14px]"
            >
              <div
                className={cx(
                  "relative flex min-h-[560px] flex-col overflow-hidden border max-[680px]:min-h-[480px]",
                  isSelected ? "border-gold" : "border-cream-25",
                )}
              >
                <div className="absolute inset-0 bg-ground">
                  <div className={cx("absolute inset-0", GRAD[plan.grad])} />
                  <div className="bg-plan-scrim pointer-events-none absolute inset-0" />
                </div>
                <div className="pointer-events-none relative flex items-start justify-between px-[24px] pt-[24px]">
                  <div>
                    <Heading as="div" className="text-[26px] tracking-[0.02em]">
                      {plan.name}
                    </Heading>
                    <MonoLabel className="mt-[8px] block text-[26px] font-medium">
                      {plan.price}
                      {plan.priceSub ? (
                        <span className="text-[15px] text-cream-65">
                          {plan.priceSub}
                        </span>
                      ) : null}
                    </MonoLabel>
                  </div>
                  <div
                    className={cx(
                      "h-[22px] w-[22px] rounded-full border-2",
                      isSelected
                        ? "border-gold bg-gold"
                        : "border-cream-70 bg-transparent",
                    )}
                  />
                </div>
                <div className="pointer-events-none relative mt-auto px-[24px] pb-[22px]">
                  {plan.features.map((feat) => (
                    <MonoLabel
                      key={feat}
                      className="block text-[12.5px] leading-[2.15] tracking-[0.12em] text-cream-85"
                    >
                      {feat}
                    </MonoLabel>
                  ))}
                </div>
              </div>
              {isSelected ? (
                <CtaButton
                  variant="accent"
                  href="#cta"
                  className={PLAN_CTA_CLS}
                >
                  {plan.cta}
                </CtaButton>
              ) : (
                <CtaButton
                  variant="ghost"
                  onClick={() => setSelected(plan.id)}
                  className={PLAN_CTA_CLS}
                >
                  {choosePlanLabel}
                </CtaButton>
              )}
            </div>
          );
        })}
      </div>
      <div className="border-t border-hairline-18 px-[32px] py-[26px] text-[15px] leading-[1.8] text-cream-60">
        Choose a plan to get started with Revenue OS.
        <br />
        Platform fees credit against outcome fees — you never pay twice for the
        same visit.
      </div>
    </SectionFrame>
  );
}
