import { moats, moatsHead } from "../content/moats";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { MonoLabel } from "../design/MonoLabel";
import { SectionFrame } from "../design/SectionFrame";
import { Text } from "../design/Text";
import { reveal } from "../lib/reveal";
import { MoatArt } from "../visuals/MoatArt";

// "Why us": a left-aligned head over the three moat cards — an illustration plate
// (MoatArt) above a mono kicker, serif title and copy, revealed in a stagger.
// Titles are capped to two lines so the copy starts on one line across the row.
// Three up on lg; on md the third card turns landscape across both columns so the
// 2 + 1 split reads as deliberate; one column on phones.
export function Moats() {
  return (
    <SectionFrame id="moats">
      <div {...reveal()} className="max-w-[720px]">
        <Kicker>{moatsHead.kicker}</Kicker>
        <Heading className="mt-[20px]">{moatsHead.title}</Heading>
        <Text size="lede" className="mt-[20px] max-w-[540px]">
          {moatsHead.lede}
        </Text>
      </div>
      <ul className="mt-[56px] grid gap-[20px] md:mt-[72px] md:grid-cols-2 lg:grid-cols-3 lg:gap-[24px]">
        {moats.map((moat, i) => (
          <li
            key={moat.title}
            {...reveal(120 + i * 120)}
            className="grid grid-rows-[232px_auto] overflow-hidden rounded-[24px] bg-paper-2 md:last:col-span-2 md:last:grid-cols-2 md:last:grid-rows-none md:last:gap-x-[20px] lg:last:col-span-1 lg:last:grid-cols-none lg:last:grid-rows-[232px_auto]"
          >
            <MoatArt variant={moat.art} />
            <div className="p-[28px]">
              <MonoLabel className="text-[11.5px] text-ink-2/80 uppercase tracking-[0.14em]">
                {moat.kicker}
              </MonoLabel>
              <Heading as="h3" className="mt-[14px] max-w-[13ch]">
                {moat.title}
              </Heading>
              <Text className="mt-[12px]">{moat.copy}</Text>
            </div>
          </li>
        ))}
      </ul>
    </SectionFrame>
  );
}
