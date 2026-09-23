import { useRef } from "react";
import { hero, sampleCall } from "../content/hero";
import { Button } from "../design/Button";
import { Heading } from "../design/Heading";
import { Label } from "../design/Label";
import { Section } from "../design/Section";
import { Text } from "../design/Text";
import { BookDemoButton } from "../lib/bookingContext";
import { Icon, PLAY } from "../visuals/Icon";
import {
  clock,
  SampleCall,
  type SampleCallHandle,
} from "../visuals/SampleCall";

// The page's promise and its proof, side by side: eyebrow · the one <h1> · the
// lede · the demo button + the listen button on the left; the sample call card on
// the right, the copy centred against it (below lg the card follows the copy).
// The copy column takes the larger share (more at lg, where the card is narrow
// anyway) so the display serif always sets in three balanced lines. The listen
// button shows the call's length, so the cost of listening is on the first
// screen, and starts the sample itself — the player scrolls into view first
// where it's hidden. Below sm the buttons grow to fill their row, so a wrap
// stacks them full-width rather than unevenly. Everything is on first paint;
// nothing animates on load.
const GROW = "max-sm:grow";

export function Hero() {
  const player = useRef<SampleCallHandle>(null);
  return (
    <Section
      flush
      aria-labelledby="hero-title"
      className="grid gap-[48px] pt-[40px] pb-[56px] md:pt-[56px] md:pb-[88px] lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-[56px] lg:pt-[40px] xl:grid-cols-[1.06fr_1fr]"
    >
      <div>
        <Label className="block">{hero.eyebrow}</Label>
        <Heading level={1} id="hero-title" className="mt-[16px]">
          {hero.title}
        </Heading>
        <Text size="lede" tone="muted" className="mt-[20px] max-w-[34rem]">
          {hero.sub}
        </Text>
        <div className="mt-[32px] flex flex-wrap gap-[12px]">
          <BookDemoButton source="hero" className={GROW} />
          <Button
            variant="secondary"
            icon={<Icon d={PLAY} className="size-[14px] fill-current" />}
            onClick={() => player.current?.play()}
            className={GROW}
          >
            {hero.secondary}
            <span className="font-mono text-[13px] text-ink-2 tabular-nums">
              {clock(sampleCall.seconds)}
            </span>
          </Button>
        </div>
      </div>
      <SampleCall ref={player} />
    </Section>
  );
}
