import { closing } from "../content/closing";
import { Card } from "../design/Card";
import { Heading } from "../design/Heading";
import { Section } from "../design/Section";
import { Text } from "../design/Text";
import { BookDemoButton } from "../lib/bookingContext";
import { CHECK, Icon } from "../visuals/Icon";

// The closing invitation — compact and specific. The page's second (and last)
// serif line makes the ask, the demo button answers it, and a short checklist
// says exactly what the 30 minutes cover: beside the statement on lg (sized to
// its content, so no item wraps), below it on smaller screens — its own heading
// groups it, so no divider. One quiet wash card holds it all; a full-bleed band
// on phones.
export function ClosingCta() {
  return (
    <Section id="book-cta" aria-labelledby="closing-title">
      <Card className="-mx-[20px] grid gap-[40px] px-[20px] py-[40px] max-md:rounded-none md:mx-0 md:p-[48px] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-[48px] xl:gap-[80px] xl:p-[64px]">
        <div>
          <Heading id="closing-title" size="statement">
            {closing.title}
          </Heading>
          <Text tone="muted" className="mt-[16px] max-w-[52ch]">
            {closing.sub}
          </Text>
          <BookDemoButton source="closing" className="mt-[28px]" />
        </div>
        <div>
          <Heading as="h3">{closing.coversTitle}</Heading>
          <ul className="mt-[16px] flex flex-col gap-[12px]">
            {closing.covers.map((item) => (
              <li
                key={item}
                className="flex gap-[12px] text-balance text-[16px] text-ink leading-[1.5]"
              >
                <Icon
                  d={CHECK}
                  className="mt-[4px] size-[16px] shrink-0 text-ink-2"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </Section>
  );
}
