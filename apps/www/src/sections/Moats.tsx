import type { ReactNode } from "react";
import { examples } from "../content/examples";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { MonoLabel } from "../design/MonoLabel";
import { SectionFrame } from "../design/SectionFrame";
import { Text } from "../design/Text";
import { cx } from "../lib/cx";
import { reveal } from "../lib/reveal";
import { CHECK, Icon } from "../visuals/Icon";
import { MoatArt, type Variant } from "../visuals/MoatArt";

// "Examples": a left-aligned head over three demonstration cards — an illustration
// plate (MoatArt), a mono kicker ("Example 01"), serif title and one short
// explanation, then the example itself on a small inset slip in the hero call
// card's vocabulary (mono caps labels, serif names, paper-2 agent bubbles, ink buyer
// bubbles), revealed in a stagger. Three up on lg,
// where the cards share three subgrid rows so every title and slip lines up; on md
// the third card turns landscape across both columns (plate left, words right, its
// example under both) so the 2 + 1 split reads as deliberate; one column on phones.
const CAPS = "text-[11px] uppercase tracking-[0.1em]";
const SLIP =
  "flex flex-1 flex-col gap-[12px] rounded-[16px] border border-line bg-card p-[16px]";
const BUBBLE =
  "text-pretty rounded-[16px] px-[12px] py-[7px] text-[13.5px] leading-[1.5]";
const WHO = "mb-[4px] text-[10.5px] text-stone tracking-[0.06em]";
const NAME =
  "whitespace-nowrap font-serif text-[18px] text-ink leading-[1.3] tracking-[-0.01em]";
const HEADER =
  "flex flex-wrap items-center justify-between gap-x-[12px] gap-y-[6px] border-line border-b pb-[12px]";

function Conversation() {
  const { header, lines } = examples.conversation;
  return (
    <div className={SLIP}>
      <MonoLabel className={cx(CAPS, "text-stone")}>{header}</MonoLabel>
      <ol className="flex flex-col gap-[8px]">
        {lines.map(({ who, text }) => {
          const agent = who === "Agent";
          return (
            <li
              key={text}
              className={cx(
                "flex flex-col",
                agent ? "items-start pr-[20px]" : "items-end pl-[20px]",
              )}
            >
              <MonoLabel className={WHO}>{who}</MonoLabel>
              <p
                className={cx(
                  BUBBLE,
                  agent
                    ? "rounded-tl-[6px] bg-paper-2 text-ink-2"
                    : "rounded-tr-[6px] bg-ink text-paper",
                )}
              >
                {text}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Summary() {
  const { lead, state, fields } = examples.summary;
  return (
    <div className={SLIP}>
      <div className={HEADER}>
        <span className={NAME}>{lead}</span>
        <MonoLabel className="inline-flex shrink-0 items-center gap-[5px] rounded-full border border-line bg-paper px-[8px] py-[3px] text-[11px] text-olive-deep">
          <Icon d={CHECK} className="size-[11px]" />
          {state}
        </MonoLabel>
      </div>
      <dl className="-mt-[4px] grid grid-cols-[auto_minmax(0,1fr)] gap-x-[14px]">
        {fields.map(({ label, value }, i) => {
          const outcome = i === fields.length - 1; // "Next step"
          return (
            <div
              key={label}
              className="col-span-2 grid grid-cols-subgrid items-baseline border-line border-t py-[7px] first:border-t-0"
            >
              <dt
                className={cx(
                  "font-mono text-[10.5px] uppercase tracking-[0.08em]",
                  outcome ? "text-clay-deep" : "text-stone",
                )}
              >
                {label}
              </dt>
              <dd
                className={cx(
                  "text-pretty text-[13.5px] leading-[1.45]",
                  outcome ? "font-medium text-ink" : "text-ink-2",
                )}
              >
                {value}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function Visit() {
  const { contact, channel, messages } = examples.visit;
  return (
    <div className={SLIP}>
      <div className={HEADER}>
        <span className={NAME}>{contact}</span>
        <MonoLabel className={cx(CAPS, "text-stone")}>{channel}</MonoLabel>
      </div>
      <ol className="flex flex-col gap-[8px]">
        {messages.map(({ time, text }) => (
          <li key={time} className="flex flex-col items-start pr-[20px]">
            <MonoLabel className={cx(WHO, "tabular-nums")}>{time}</MonoLabel>
            <p className={cx(BUBBLE, "rounded-tl-[6px] bg-paper-2 text-ink-2")}>
              {text}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

const CARDS: Array<{
  demo: { title: string; body: string };
  art: Variant;
  slip: ReactNode;
}> = [
  { demo: examples.conversation, art: "india", slip: <Conversation /> },
  { demo: examples.summary, art: "depth", slip: <Summary /> },
  { demo: examples.visit, art: "loop", slip: <Visit /> },
];

export function Moats() {
  return (
    <SectionFrame id="examples">
      <div {...reveal()} className="max-w-[720px]">
        <Kicker>{examples.kicker}</Kicker>
        <Heading className="mt-[20px]">{examples.title}</Heading>
        <Text size="lede" className="mt-[20px] max-w-[540px]">
          {examples.intro}
        </Text>
      </div>
      <ul className="mt-[56px] grid gap-[20px] md:mt-[72px] md:grid-cols-2 lg:grid-cols-3 lg:grid-rows-[232px_auto_1fr] lg:gap-x-[24px] lg:gap-y-0">
        {CARDS.map(({ demo, art, slip }, i) => {
          const wide = i === CARDS.length - 1; // landscape across md's two columns
          return (
            <li
              key={demo.title}
              {...reveal(120 + i * 120)}
              className={cx(
                "flex flex-col overflow-hidden rounded-[24px] bg-paper-2 lg:row-span-3 lg:grid lg:grid-rows-subgrid",
                wide &&
                  "md:col-span-2 md:grid md:grid-cols-2 md:gap-x-[20px] lg:col-span-1 lg:grid-cols-none lg:gap-x-0",
              )}
            >
              <div
                className={cx(
                  "h-[232px] shrink-0",
                  wide && "md:h-auto lg:h-[232px]",
                )}
              >
                <MoatArt variant={art} />
              </div>
              <div className="px-[28px] pt-[28px]">
                <MonoLabel className="text-[11.5px] text-ink-2/80 uppercase tracking-[0.14em]">
                  {examples.badge} {String(i + 1).padStart(2, "0")}
                </MonoLabel>
                <Heading as="h3" className="mt-[14px]">
                  {demo.title}
                </Heading>
                <Text className="mt-[12px]">{demo.body}</Text>
              </div>
              <div
                className={cx(
                  "flex flex-1 flex-col px-[28px] pt-[24px] pb-[28px]",
                  wide && "md:col-span-2 lg:col-span-1",
                )}
              >
                {slip}
              </div>
            </li>
          );
        })}
      </ul>
    </SectionFrame>
  );
}
