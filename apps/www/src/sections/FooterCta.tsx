import { cta } from "../content/cta";
import { CtaButton } from "../design/CtaButton";
import { Heading } from "../design/Heading";
import { Kicker } from "../design/Kicker";
import { SectionFrame } from "../design/SectionFrame";
import { reveal } from "../lib/reveal";

// The closing offer (#cta) on the clay panel: eyebrow, the risk-reversal headline,
// the pilot's terms, one ink pill. Everything on clay is ink — small text at
// ink/85 (≥4.5:1); SectionFrame turns the focus rings ink. Terms are separated by a leading "·" that the list clips at each line
// start, so a wrapped line neither starts nor ends on a separator. Beside it, the
// brand mark at poster scale: the lead (a paper dot) sends out a ripple, then
// three ink arcs on faint orbits light up outward in turn — a call reaching out.
// Each arc trails the one inside it by 300ms, written as a negative delay (a full
// 3.6s period back) so no arc flashes on load; reduced motion ends every
// keyframe, resting on the whole mark fully drawn.
const C = 190;
const DOT = 32;
const ARCS = [80, 128, 176];

function CallArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 380 380"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle
        cx={C}
        cy={C}
        r={DOT}
        className="origin-center animate-[ro-ring_3.6s_var(--ease-soft)_infinite] fill-paper [transform-box:fill-box]"
      />
      <circle cx={C} cy={C} r={DOT} className="fill-paper" />
      {ARCS.map((r, i) => {
        const d = r * Math.SQRT1_2;
        return (
          <g key={r}>
            <circle
              cx={C}
              cy={C}
              r={r}
              strokeWidth="1.25"
              className="stroke-ink/15"
            />
            <path
              d={`M${C + d} ${C - d}a${r} ${r} 0 0 1 0 ${2 * d}`}
              strokeWidth="11"
              strokeLinecap="round"
              className="animate-[ro-blink_3.6s_ease-in-out_infinite] stroke-ink"
              style={{ animationDelay: `${i * 300 - 3600}ms` }}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function FooterCta() {
  return (
    <SectionFrame
      id="cta"
      tone="clay"
      className="grid items-center gap-[48px] md:grid-cols-[3fr_2fr] lg:gap-[64px]"
    >
      <div {...reveal()} className="flex flex-col items-start">
        <Kicker tone="clay">{cta.kicker}</Kicker>
        <Heading className="mt-[24px] max-w-[19ch]">{cta.headline}</Heading>
        <ul className="m-0 mt-[28px] flex list-none flex-wrap gap-x-[24px] gap-y-[4px] overflow-hidden p-0 font-mono text-[12.5px] text-ink/85 tracking-[0.04em]">
          {cta.terms.map((term) => (
            <li
              key={term}
              className="-ml-[24px] whitespace-nowrap before:inline-block before:w-[24px] before:text-center before:content-['·']"
            >
              {term}
            </li>
          ))}
        </ul>
        <CtaButton
          variant="accent"
          size="lg"
          arrow
          href={cta.href}
          className="mt-[40px]"
        >
          {cta.button}
        </CtaButton>
      </div>
      <div {...reveal(160)} className="hidden justify-center md:flex">
        <CallArt className="w-full max-w-[420px]" />
      </div>
    </SectionFrame>
  );
}
