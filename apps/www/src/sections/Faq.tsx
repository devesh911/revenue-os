import { useId, useState } from "react";
import { defaultOpenFaq, faqCopy, faqs } from "../content/faqs";
import { Heading } from "../design/Heading";
import { Section } from "../design/Section";
import { Text } from "../design/Text";
import { cx } from "../lib/cx";
import { BAR, Icon } from "../visuals/Icon";

// The short FAQ: the head beside (lg, on the page's 5/7 split) or above the list,
// and an accordion whose items open and close independently — one open on first
// paint (defaultOpenFaq, the SSR pin), so opening a question never collapses the
// one being read. Each item's outer element carries data-faq / data-open. Answers
// are always rendered so they can ease open (grid rows 0fr → 1fr); closed ones are
// `inert`, so keyboard and screen readers skip them. Panels stay plain blocks, not
// regions — six named landmarks would crowd screen-reader navigation. The plus is
// two bars: the vertical one turns flat to make the minus. Hairlines separate
// items — no boxes.
export function Faq() {
  const [open, setOpen] = useState(() => new Set([defaultOpenFaq]));
  const id = useId();
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(i)) next.add(i);
      return next;
    });
  return (
    <Section
      id="faq"
      aria-labelledby="faq-title"
      className="grid gap-[28px] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-[64px]"
    >
      <div>
        <Heading id="faq-title">{faqCopy.title}</Heading>
        <Text tone="muted" className="mt-[12px]">
          {faqCopy.sub}
        </Text>
      </div>
      <div>
        {faqs.map((faq, i) => {
          const isOpen = open.has(i);
          return (
            <div
              key={faq.q}
              data-faq={i}
              data-open={isOpen}
              className="border-line border-b first:border-t"
            >
              <Heading as="h3">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`${id}a${i}`}
                  onClick={() => toggle(i)}
                  className="group flex min-h-[64px] w-full cursor-pointer items-center justify-between gap-[24px] py-[18px] text-left text-pretty"
                >
                  {faq.q}
                  <span
                    aria-hidden="true"
                    className="grid shrink-0 text-ink-2 transition-colors duration-150 group-hover:text-ink *:col-start-1 *:row-start-1"
                  >
                    <Icon d={BAR} className="size-[16px]" />
                    <Icon
                      d={BAR}
                      className={cx(
                        "size-[16px] transition-transform duration-200",
                        !isOpen && "rotate-90",
                      )}
                    />
                  </span>
                </button>
              </Heading>
              <div
                id={`${id}a${i}`}
                inert={!isOpen}
                className={cx(
                  "grid transition-[grid-template-rows] duration-200",
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <div className="overflow-hidden">
                  <Text
                    tone="muted"
                    className="max-w-[64ch] pb-[24px] md:pr-[40px]"
                  >
                    {faq.a}
                  </Text>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
