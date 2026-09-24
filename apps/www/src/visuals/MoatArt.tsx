import { type CSSProperties, type ReactNode, useRef } from "react";
import { examples } from "../content/examples";
import { cx } from "../lib/cx";
import { useLiveSvg } from "../lib/motion";

// The example plates: editorial ink line art on a flat plate colour, one clay
// accent each, and one calm loop that restates the example. `india` (the Hinglish
// conversation): the call floats in the buyer's own phrases, stamped Hinglish
// (an oval stamp, so the longer word keeps the 11px stamp type); `depth` (the
// summary): one shaft a dot descends field by field, down to the next step, beside
// a row of shallow ticks; `loop` (the visit): a dot rides a spiral inward —
// confirmed, reminded — and lands on the site visit. Decorative beside
// real copy (aria-hidden); the plate words come from content/examples. Strokes are
// drawn by default — they only hide to draw on (after --draw-after, once the card
// is revealed) while JS has opted motion in (html[data-motion]) and the page-wide
// pause is off. Each SMIL dot sits in data-motion-only, with a static twin at rest
// shown instead under reduced motion or the page-wide pause (LIVE / REST); every
// loop (SMIL and the CSS float) holds still while the plate is off screen.
export type Variant = "depth" | "india" | "loop";

const PLATE: Record<Variant, string> = {
  depth: "bg-oat",
  india: "bg-cactus",
  loop: "bg-heather",
};

const LIVE = "[html[data-still]_&]:hidden";
const REST = "fill-clay motion-safe:hidden [html[data-still]_&]:inline";

const DRAW =
  "[html[data-motion]:not([data-still])_&]:[stroke-dasharray:1_2] [html[data-motion]:not([data-still])_&]:[stroke-dashoffset:1] in-data-shown:animate-[ro-draw_1.6s_var(--ease-soft)_calc(var(--reveal-delay,0ms)_+_var(--draw-after,250ms))_forwards]";

// A pill speech bubble at (x, y, w, h), its tail leaning `dir` from near that side.
const bubble = (x: number, y: number, w: number, h: number, dir: 1 | -1) => {
  const [r, t] = [h / 2, dir < 0 ? x + 34 : x + w - 34];
  return `M${x + r} ${y}H${x + w - r}a${r} ${r} 0 0 1 0 ${h}H${t + 5}L${t + dir * 9} ${y + h + 10}L${t - 5} ${y + h}H${x + r}a${r} ${r} 0 0 1 0 ${-h}Z`;
};

// One bubble per conversation phrase, sized to it (the words measure 77, 91 and
// 94px in Lora italic 18): the agent's reply tucks over the buyer's lower edge; the
// buyer's next line stands clear.
const BUBBLES: Array<[number, number, number, number, 1 | -1]> = [
  [44, 34, 136, 48, -1],
  [128, 76, 150, 48, 1],
  [74, 142, 152, 44, -1],
];

// The loop: a spiral of half-turns, each 14 tighter than the last, alternating
// about (180,123) and (194,123) — smooth, three turns from the left edge in to the
// heart at (186,123); its bounding box centres on the plate. The visit's three
// moments label it: the outer start, the first half-turn, and — down a dotted
// leader — the heart the dot lands on.
const SPIRAL =
  "M102 123A78 78 0 0 1 258 123A64 64 0 0 1 130 123A50 50 0 0 1 230 123A36 36 0 0 1 158 123A22 22 0 0 1 202 123A8 8 0 0 1 186 123";

const PROBES = Array.from(
  { length: 10 },
  (_, i) => `M${52 + i * 14} 48v12`,
).join("");

const ART: Record<Variant, ReactNode> = {
  depth: (
    <>
      <path
        d="M40 88H320M40 124H320M40 160H320"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeDasharray="1.5 6"
        className="opacity-40"
      />
      <g stroke="currentColor">
        <path d="M40 48H236M252 48H320" pathLength={1} className={DRAW} />
        <path d={PROBES} />
        <path
          d="M236 48v136a8 8 0 0 0 16 0V48"
          pathLength={1}
          className={cx(DRAW, "fill-oat")}
        />
      </g>
      <g
        textAnchor="end"
        className="fill-ink-2 font-mono text-[10.5px] uppercase tracking-[0.12em]"
      >
        {examples.summary.plate.map((word, i) => (
          <text key={word} x="222" y={109.5 + i * 36}>
            {word}
          </text>
        ))}
      </g>
      <g data-motion-only="" className={LIVE}>
        <circle cx="244" cy="178" r="5" className="fill-clay">
          <animate
            attributeName="cy"
            dur="5s"
            repeatCount="indefinite"
            values="54;106;106;142;142;178;178"
            keyTimes="0;.16;.28;.44;.56;.72;1"
            calcMode="spline"
            keySplines=".5 0 .2 1;0 0 1 1;.5 0 .2 1;0 0 1 1;.5 0 .2 1;0 0 1 1"
          />
          <animate
            attributeName="opacity"
            dur="5s"
            repeatCount="indefinite"
            values="0;1;1;0"
            keyTimes="0;.08;.9;1"
          />
        </circle>
      </g>
      <circle cx="244" cy="178" r="5" className={REST} />
    </>
  ),
  india: (
    <>
      {BUBBLES.map(([x, y, w, h, dir], i) => (
        <g
          key={x}
          className="animate-[ro-float_6s_ease-in-out_infinite]"
          style={
            {
              animationDelay: `${i * -2}s`,
              "--draw-after": `${250 + i * 300}ms`,
            } as CSSProperties
          }
        >
          <path
            d={bubble(x, y, w, h, dir)}
            stroke="currentColor"
            pathLength={1}
            className={cx(DRAW, "fill-cactus")}
          />
          <text
            x={x + w / 2}
            y={y + h / 2 + 6}
            textAnchor="middle"
            className="fill-ink font-serif text-[18px] italic"
          >
            {examples.conversation.plate.phrases[i]}
          </text>
        </g>
      ))}
      <g transform="rotate(-12 296 180)">
        <ellipse cx="296" cy="180" rx="44" ry="28" className="fill-clay" />
        <ellipse
          cx="296"
          cy="180"
          rx="39"
          ry="23"
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
        <text
          x="296"
          y="184"
          textAnchor="middle"
          className="fill-ink font-mono text-[11px] uppercase tracking-[0.12em]"
        >
          {examples.conversation.plate.stamp}
        </text>
      </g>
    </>
  ),
  loop: (
    <>
      <path d={SPIRAL} stroke="currentColor" pathLength={1} className={DRAW} />
      <path
        d="M186 132V196"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeDasharray="1.5 6"
        className="opacity-40"
      />
      <g className="fill-ink-2 font-mono text-[10.5px] uppercase tracking-[0.12em]">
        <text x="90" y="127" textAnchor="end">
          {examples.visit.plate[0]}
        </text>
        <text x="270" y="127">
          {examples.visit.plate[1]}
        </text>
        <text x="186" y="214" textAnchor="middle">
          {examples.visit.plate[2]}
        </text>
      </g>
      <g data-motion-only="" className={LIVE}>
        <circle r="6" className="fill-clay">
          <animateMotion
            dur="8s"
            repeatCount="indefinite"
            path={SPIRAL}
            keyPoints="0;1;1"
            keyTimes="0;.8;1"
            calcMode="spline"
            keySplines=".4 0 .6 1;0 0 1 1"
          />
          <animate
            attributeName="opacity"
            dur="8s"
            repeatCount="indefinite"
            values="0;1;1;0"
            keyTimes="0;.06;.93;1"
          />
        </circle>
      </g>
      <circle cx="186" cy="123" r="6" className={REST} />
    </>
  ),
};

export function MoatArt({ variant }: { variant: Variant }) {
  const svg = useRef<SVGSVGElement>(null);
  useLiveSvg(svg);
  return (
    <svg
      ref={svg}
      viewBox="0 0 360 232"
      fill="none"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cx("block size-full text-ink", PLATE[variant])}
    >
      {ART[variant]}
    </svg>
  );
}
