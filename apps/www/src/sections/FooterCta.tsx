import { closing } from "../content/closing";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { MonoLabel } from "../design/MonoLabel";
import { SectionFrame } from "../design/SectionFrame";
import { BookDemoButton } from "../lib/bookingContext";
import { reveal } from "../lib/reveal";
import { CallArt } from "../visuals/CallArt";
import { CHECK, Icon } from "../visuals/Icon";

// The closing invitation (#cta) on the clay panel: eyebrow, the headline, what the
// demo shows, then what its 30 minutes cover (a mono label over a checked list,
// where the old terms row sat) and the one ink pill; beside it (md+) the brand mark
// at poster scale. Everything on clay is ink — small text at ink/85 (≥4.5:1);
// SectionFrame turns the focus rings ink.
export function FooterCta() {
  return (
    <SectionFrame
      id="cta"
      tone="clay"
      className="grid items-center gap-[48px] md:grid-cols-[3fr_2fr] lg:gap-[64px]"
    >
      <div {...reveal()} className="flex flex-col items-start">
        <Kicker tone="clay">{closing.kicker}</Kicker>
        <Heading className="mt-[24px] max-w-[19ch]">{closing.title}</Heading>
        <p className="mt-[20px] max-w-[46ch] text-pretty text-[17px] text-ink/85 leading-[1.6] md:text-[18px]">
          {closing.sub}
        </p>
        <MonoLabel
          id="cta-covers"
          className="mt-[32px] text-[12.5px] text-ink/85 tracking-[0.04em]"
        >
          {closing.coversTitle}
        </MonoLabel>
        <ul
          aria-labelledby="cta-covers"
          className="mt-[14px] flex w-full max-w-[460px] flex-col gap-[10px] border-ink/15 border-t pt-[16px]"
        >
          {closing.covers.map((item) => (
            <li
              key={item}
              className="flex items-start gap-[12px] text-[15px] text-ink leading-[1.5]"
            >
              <Icon d={CHECK} className="mt-[3px] size-[16px] shrink-0" />
              {item}
            </li>
          ))}
        </ul>
        <BookDemoButton
          source="closing"
          size="lg"
          arrow
          className="mt-[40px]"
        />
      </div>
      <div {...reveal(160)} className="hidden justify-center md:flex">
        <CallArt className="w-full max-w-[420px]" />
      </div>
    </SectionFrame>
  );
}
