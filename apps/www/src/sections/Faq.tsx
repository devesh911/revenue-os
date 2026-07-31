import { useState } from "react";
import { defaultOpenFaq, faqs } from "../content/faqs";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { MonoLabel } from "../design/MonoLabel";
import { SectionFrame } from "../design/SectionFrame";
import { Text } from "../design/Text";

// FAQ accordion — a sticky-feeling side head beside the questions. Exactly one item
// is open (default = item 0, the SSR pin); its answer renders and its mark flips
// − / +. The data-faq / data-open hooks make the open state machine-checkable.
export function Faq() {
  const [open, setOpen] = useState<number>(defaultOpenFaq);
  return (
    <SectionFrame
      id="faq"
      className="grid grid-cols-[380px_1fr] max-[980px]:grid-cols-1"
    >
      <div className="border-r border-hairline-18 px-[40px] py-[64px] max-[980px]:border-r-0 max-[980px]:border-b max-[980px]:border-hairline-18 max-[980px]:px-[28px] max-[980px]:py-[44px]">
        <Kicker className="mb-[20px]">PLOT 03 — QUESTIONS</Kicker>
        <Heading className="text-[40px] leading-[1.15] tracking-[0.02em]">
          ASKED BEFORE EVERY PILOT
        </Heading>
      </div>
      <div>
        {faqs.map((faq, i) => {
          const isOpen = i === open;
          return (
            <div
              key={faq.q}
              data-faq={i}
              data-open={isOpen ? "true" : "false"}
              className="border-b border-hairline-12"
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? -1 : i)}
                className="flex w-full cursor-pointer items-center justify-between gap-[20px] border-none bg-transparent px-[36px] py-[26px] text-left text-cream hover:bg-cream-03 focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-[3px] max-[680px]:px-[22px] max-[680px]:py-[20px]"
              >
                <Heading
                  as="span"
                  className="text-[21px] max-[680px]:text-[18px]"
                >
                  {faq.q}
                </Heading>
                <MonoLabel className="text-[16px] text-cream-50">
                  {isOpen ? "−" : "+"}
                </MonoLabel>
              </button>
              {isOpen ? (
                <Text className="max-w-[68ch] px-[36px] pt-0 pb-[28px] text-[15.5px] leading-[1.75] text-cream-68 max-[680px]:px-[22px] max-[680px]:pb-[24px]">
                  {faq.a}
                </Text>
              ) : null}
            </div>
          );
        })}
      </div>
    </SectionFrame>
  );
}
