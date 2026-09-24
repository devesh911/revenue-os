import { useId, useState } from "react";
import { pilot } from "../content/pilot";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { MonoLabel } from "../design/MonoLabel";
import { SectionFrame } from "../design/SectionFrame";
import { Text } from "../design/Text";
import { BookDemoButton } from "../lib/bookingContext";
import { cx } from "../lib/cx";
import { reveal } from "../lib/reveal";
import { BAR, CHECK, CHEVRON, Icon } from "../visuals/Icon";

// The pilot, on the wash panel: a centred head, then the four facts as paper
// cards (2 × 2) beside how fees work — in words, no rates — on the card that
// carries the page's decision look (ink border, the soft lift) and the one "Book a
// demo" (source "pilot"). From lg the facts take two columns and the fees card the
// third, its button pinned to the foot. The plan comparison stays secondary: a
// ghost-pill "Compare plans" toggle (the FAQ's disclosure — the panel eases open
// on grid rows and is `inert` while closed) over three plan cards in the plan-card
// look, with no figures, no selection and no per-plan button. A check marks only
// what exists today; roadmap items sit under "Planned", quieter and unchecked. On
// lg the plan cards share four subgrid rows, so each hairline lines up.
const CARD = "rounded-[24px] border bg-paper p-[28px]";
const SUBGRID = "lg:row-span-4 lg:grid lg:grid-rows-subgrid";
const ITEM = "flex items-start gap-[12px] text-[15px] leading-[1.5]";

export function Pricing() {
  const { facts, fees, compare } = pilot;
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <SectionFrame id="pilot" tone="wash">
      <div {...reveal()} className="mx-auto max-w-[720px] text-center">
        <Kicker className="justify-center">{pilot.kicker}</Kicker>
        <Heading className="mt-[20px]">{pilot.title}</Heading>
        <Text size="lede" className="mx-auto mt-[20px] max-w-[54ch]">
          {pilot.intro}
        </Text>
      </div>

      <div className="mt-[56px] grid gap-[20px] md:mt-[72px] lg:grid-cols-3 lg:gap-[24px]">
        <ul className="grid gap-[20px] md:grid-cols-2 lg:col-span-2 lg:gap-[24px]">
          {facts.map((fact, i) => (
            <li
              key={fact.title}
              {...reveal(100 + i * 90)}
              className={cx(CARD, "border-line")}
            >
              <Heading as="h3">{fact.title}</Heading>
              <Text className="mt-[12px]">{fact.body}</Text>
            </li>
          ))}
        </ul>
        <article
          {...reveal(100 + facts.length * 90)}
          className={cx(
            CARD,
            "flex flex-col border-ink shadow-lift forced-colors:border-[3px] md:flex-row md:items-end md:gap-[40px] lg:flex-col lg:items-stretch lg:gap-0",
          )}
        >
          <div className="md:flex-1">
            <Heading as="h3">{fees.title}</Heading>
            <Text size="lede" className="mt-[16px]">
              {fees.body}
            </Text>
          </div>
          <div className="mt-auto pt-[36px] md:pt-0 lg:pt-[36px]">
            <BookDemoButton
              source="pilot"
              size="lg"
              arrow
              className="w-full md:w-auto lg:w-full"
            />
          </div>
        </article>
      </div>

      <div {...reveal(120)} className="mt-[48px] md:mt-[64px]">
        <div className="flex justify-center">
          <button
            type="button"
            id={`${id}b`}
            aria-expanded={open}
            aria-controls={`${id}p`}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex h-[42px] cursor-pointer items-center gap-[8px] rounded-full border border-ink/15 px-[18px] font-medium text-[14.5px] text-ink transition-[background-color,border-color] duration-200 hover:border-ink/40 hover:bg-ink/[0.03]"
          >
            {compare.summary}
            <Icon
              d={CHEVRON}
              className={cx(
                "size-[16px] transition-transform duration-300 ease-[var(--ease-soft)]",
                open && "rotate-180",
              )}
            />
          </button>
        </div>
        <section
          id={`${id}p`}
          aria-labelledby={`${id}b`}
          inert={!open}
          className={cx(
            "grid transition-[grid-template-rows,opacity] duration-[400ms] ease-[var(--ease-soft)]",
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <ul className="mx-auto grid max-w-[520px] gap-[20px] pt-[32px] lg:max-w-none lg:grid-cols-3 lg:gap-x-[24px] lg:gap-y-0">
              {compare.plans.map((plan, i) => (
                <li key={plan.name} className={cx("flex", SUBGRID)}>
                  <article
                    className={cx(
                      CARD,
                      "flex flex-1 flex-col border-line",
                      SUBGRID,
                    )}
                  >
                    <Heading as="h3">{plan.name}</Heading>
                    <Text size="small" tone="muted" className="mt-[6px]">
                      {plan.price}
                    </Text>
                    <ul className="mt-[28px] flex flex-col gap-[12px] border-line border-t pt-[24px]">
                      {plan.features.map((feature) => (
                        <li key={feature} className={cx(ITEM, "text-ink-2")}>
                          <Icon
                            d={CHECK}
                            className="mt-[3px] size-[16px] shrink-0 text-olive-deep"
                          />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <div>
                      {plan.planned.length > 0 && (
                        <>
                          <MonoLabel
                            id={`${id}n${i}`}
                            className="mt-[28px] block text-[11px] text-stone uppercase tracking-[0.1em]"
                          >
                            {compare.plannedLabel}
                          </MonoLabel>
                          <ul
                            aria-labelledby={`${id}n${i}`}
                            className="mt-[14px] flex flex-col gap-[10px]"
                          >
                            {plan.planned.map((item) => (
                              <li key={item} className={cx(ITEM, "text-stone")}>
                                <Icon
                                  d={BAR}
                                  className="mt-[3px] size-[16px] shrink-0 text-mute"
                                />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </SectionFrame>
  );
}
