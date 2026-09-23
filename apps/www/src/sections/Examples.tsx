import { examples } from "../content/examples";
import { Card } from "../design/Card";
import { Heading } from "../design/Heading";
import { Label } from "../design/Label";
import { Section } from "../design/Section";
import { Text } from "../design/Text";
import { cx } from "../lib/cx";
import { CHECK, Icon } from "../visuals/Icon";

// Three buyer-specific demonstrations — the call, the summary a salesperson gets,
// the WhatsApp confirmation — each a small product screen beside one short
// explanation. Phones stack words then screen, full width; from md the rows sit
// side by side (text 5, screen 7) and alternate. The screen sits straight on the
// page — no stage behind it — captioned with the page's honesty pill ("Example"),
// so no name or time reads as real data. Our side of a thread (the agent, the messages we send) is
// right-aligned on wash; the buyer is left on white. Colour marks only meaning:
// olive + check for the qualified state (the page's success idiom), and — as in
// the hero's result panel — the accent on the outcome row's label ("Next step").
const BAR =
  "flex min-h-[48px] items-center justify-between gap-[12px] border-line border-b px-[16px] py-[10px] font-medium text-[15px] text-ink";
const MINI = "text-[13px] text-ink-2 leading-[1.4]";
const BUBBLE =
  "max-w-[86%] rounded-[12px] px-[14px] py-[9px] text-pretty text-[15px] text-ink leading-[1.5]";

function Conversation() {
  const { header, lines } = examples.conversation;
  return (
    <>
      <p className={BAR}>{header}</p>
      <ol className="flex flex-col gap-[14px] p-[16px]">
        {lines.map(({ who, text }) => {
          const agent = who === "Agent";
          return (
            <li
              key={text}
              className={cx(
                "flex flex-col gap-[4px]",
                agent ? "items-end" : "items-start",
              )}
            >
              <span className={MINI}>{who}</span>
              <p
                className={cx(
                  BUBBLE,
                  agent
                    ? "rounded-tr-[4px] bg-wash"
                    : "rounded-tl-[4px] border border-line",
                )}
              >
                {text}
              </p>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function Summary() {
  const { lead, state, fields } = examples.summary;
  return (
    <>
      <div className={BAR}>
        <p>{lead}</p>
        <p className="flex items-center gap-[6px] text-[14px] text-olive-deep">
          <Icon d={CHECK} className="size-[16px] shrink-0" />
          {state}
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] px-[16px]">
        {fields.map(({ label, value }, i) => {
          const outcome = i === fields.length - 1; // "Next step"
          return (
            <div
              key={label}
              className="col-span-2 grid grid-cols-subgrid items-baseline gap-x-[20px] border-line border-t py-[10px] first:border-t-0"
            >
              <dt
                className={cx(
                  "text-[14px] leading-[1.45]",
                  outcome ? "font-medium text-clay-deep" : "text-ink-2",
                )}
              >
                {label}
              </dt>
              <dd
                className={cx(
                  "text-pretty text-[15px] text-ink leading-[1.45]",
                  outcome && "font-medium",
                )}
              >
                {value}
              </dd>
            </div>
          );
        })}
      </dl>
    </>
  );
}

function Thread() {
  const { contact, channel, messages } = examples.visit;
  return (
    <>
      <div className={BAR}>
        <p>{contact}</p>
        <Label className="font-normal">{channel}</Label>
      </div>
      <ol className="flex flex-col items-end gap-[10px] p-[16px]">
        {messages.map(({ time, text }) => (
          <li key={time} className={cx(BUBBLE, "rounded-tr-[4px] bg-wash")}>
            <p>{text}</p>
            <span className="mt-[2px] block text-right font-mono text-[13px] text-ink-2 tabular-nums">
              {time}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

const ROWS = [
  [examples.conversation, Conversation],
  [examples.summary, Summary],
  [examples.visit, Thread],
] as const;

export function Examples() {
  return (
    <Section id="examples" aria-labelledby="examples-title">
      <Heading id="examples-title">{examples.title}</Heading>
      <div className="mt-[32px] flex flex-col gap-[44px] md:mt-[48px] md:gap-[56px] lg:gap-[64px]">
        {ROWS.map(([{ title, body }, Mock], i) => {
          const flip = i % 2 === 1; // screen on the left (md+)
          return (
            <div
              key={title}
              className={cx(
                "grid items-center gap-[20px] md:gap-x-[40px] lg:gap-x-[64px]",
                flip ? "md:grid-cols-[7fr_5fr]" : "md:grid-cols-[5fr_7fr]",
              )}
            >
              <div className="max-w-[560px]">
                <Heading as="h3">{title}</Heading>
                <Text tone="muted" className="mt-[8px]">
                  {body}
                </Text>
              </div>
              <figure className={flip ? "md:order-first" : undefined}>
                <figcaption className="mb-[10px] flex h-[24px] w-fit items-center rounded-full bg-ink/[0.06] px-[9px] font-medium text-[13px] text-ink">
                  {examples.badge}
                </figcaption>
                <Card tone="product" className="overflow-hidden">
                  <Mock />
                </Card>
              </figure>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
