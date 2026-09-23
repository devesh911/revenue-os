import { useId, useState } from "react";
import { defaultOpenFaq, faqCopy, faqs } from "../content/faqs";
import { CtaButton } from "../design/CtaButton";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { SectionFrame } from "../design/SectionFrame";
import { Text } from "../design/Text";
import { cx } from "../lib/cx";
import { reveal } from "../lib/reveal";

// FAQ — a sticky side head beside an accordion whose items open and close
// independently (default = item 0 alone, the SSR pin), so opening one never collapses
// another and slides the tapped question away. Each item's outer element carries
// the data-faq / data-open hooks. Answers are always rendered so their height can
// ease open (grid-rows 0fr → 1fr); closed panels are `inert`, so keyboard and
// assistive tech skip them. The plus folds into a minus as its vertical bar turns.
export function Faq() {
  const [open, setOpen] = useState(() => new Set([defaultOpenFaq]));
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(i)) next.add(i);
      return next;
    });
  const id = useId();
  return (
    <SectionFrame
      id="faq"
      className="grid gap-[48px] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-[80px]"
    >
      <div {...reveal()} className="lg:sticky lg:top-[112px] lg:self-start">
        <Kicker>{faqCopy.kicker}</Kicker>
        <Heading className="mt-[20px]">{faqCopy.title}</Heading>
        <Text className="mt-[20px] max-w-[40ch]">{faqCopy.sub}</Text>
        <CtaButton
          variant="ghost"
          size="md"
          arrow
          href="#cta"
          className="mt-[28px]"
        >
          {faqCopy.cta}
        </CtaButton>
      </div>
      <div {...reveal(120)}>
        {faqs.map((faq, i) => {
          const isOpen = open.has(i);
          return (
            <div
              key={faq.q}
              data-faq={i}
              data-open={isOpen ? "true" : "false"}
              className="border-line border-b first:border-t"
            >
              <Heading as="h3" size="none">
                <button
                  type="button"
                  id={`${id}q${i}`}
                  aria-expanded={isOpen}
                  aria-controls={`${id}a${i}`}
                  onClick={() => toggle(i)}
                  className="flex w-full cursor-pointer items-center justify-between gap-[24px] py-[26px] text-left text-[20px] text-ink leading-[1.35] tracking-[-0.01em] transition-colors duration-200 hover:text-clay-deep md:text-[22px]"
                >
                  {faq.q}
                  <svg
                    viewBox="0 0 14 14"
                    aria-hidden="true"
                    className="size-[14px] shrink-0"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M0 7h14" />
                    <path
                      d="M7 0v14"
                      className={cx(
                        "origin-center transition-transform duration-300 ease-[var(--ease-soft)] [transform-box:fill-box]",
                        isOpen && "rotate-90",
                      )}
                    />
                  </svg>
                </button>
              </Heading>
              <section
                id={`${id}a${i}`}
                aria-labelledby={`${id}q${i}`}
                inert={!isOpen}
                className={cx(
                  "grid transition-[grid-template-rows,opacity] duration-[400ms] ease-[var(--ease-soft)]",
                  isOpen
                    ? "grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0",
                )}
              >
                <div className="overflow-hidden">
                  <Text className="max-w-[62ch] pr-[38px] pb-[36px]">
                    {faq.a}
                  </Text>
                </div>
              </section>
            </div>
          );
        })}
      </div>
    </SectionFrame>
  );
}
