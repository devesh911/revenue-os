import type { CSSProperties, ReactNode } from "react";
import type { Moat } from "../content/moats";
import { cx } from "../lib/cx";

// The moat plates: editorial ink line art on a flat plate colour, one clay accent
// each, and one calm loop that restates the claim. `depth`: ten shallow probes
// (the generalists' ten industries) beside one shaft a dot descends, stratum by
// stratum; `india`: the conversation floats in the words buyers actually use,
// stamped RERA; `loop`: a dot rides a spiral inward — every pass tighter than the
// last — and lands on the next buyer. Decorative beside real copy (aria-hidden).
// Strokes are drawn by default — they only hide to draw on (after --draw-after)
// once JS has opted motion in (html[data-motion]) and the card is revealed. Each
// SMIL dot sits in data-motion-only, with a static twin shown under reduced motion.
type Variant = Moat["art"];

const PLATE: Record<Variant, string> = {
  depth: "bg-oat",
  india: "bg-cactus",
  loop: "bg-heather",
};

const DRAW =
  "[html[data-motion]_&]:[stroke-dasharray:1_2] [html[data-motion]_&]:[stroke-dashoffset:1] in-data-shown:animate-[ro-draw_1.6s_var(--ease-soft)_calc(var(--reveal-delay,0ms)_+_var(--draw-after,250ms))_forwards]";

// A pill speech bubble at (x, y, w, h), its tail leaning `dir` from near that side.
const bubble = (x: number, y: number, w: number, h: number, dir: 1 | -1) => {
  const [r, t] = [h / 2, dir < 0 ? x + 34 : x + w - 34];
  return `M${x + r} ${y}H${x + w - r}a${r} ${r} 0 0 1 0 ${h}H${t + 5}L${t + dir * 9} ${y + h + 10}L${t - 5} ${y + h}H${x + r}a${r} ${r} 0 0 1 0 ${-h}Z`;
};

// The reply tucks over the greeting's lower edge; the third line stands clear.
const BUBBLES: Array<[string, number, number, number, number, 1 | -1]> = [
  ["Namaste", 56, 36, 136, 48, -1],
  ["Haan ji", 140, 76, 124, 48, 1],
  ["Hello", 96, 140, 104, 44, -1],
];

// The loop: a spiral of half-turns, each 14 tighter than the last, alternating
// about (180,123) and (194,123) — smooth, three turns from the left edge in to the
// heart at (186,123); its bounding box centres on the plate.
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
        className="fill-ink-2 font-mono text-[10.5px] tracking-[0.12em]"
      >
        <text x="222" y="109.5">
          INVENTORY
        </text>
        <text x="222" y="145.5">
          SITE VISITS
        </text>
        <text x="222" y="181.5">
          RERA
        </text>
      </g>
      <g data-motion-only="">
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
      <circle
        cx="244"
        cy="178"
        r="5"
        className="fill-clay motion-safe:hidden"
      />
    </>
  ),
  india: (
    <>
      {BUBBLES.map(([word, x, y, w, h, dir], i) => (
        <g
          key={word}
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
            {word}
          </text>
        </g>
      ))}
      <g transform="rotate(-12 292 166)">
        <circle cx="292" cy="166" r="26" className="fill-clay" />
        <circle
          cx="292"
          cy="166"
          r="21"
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
        <text
          x="292"
          y="170"
          textAnchor="middle"
          className="fill-ink font-mono text-[11px] tracking-[0.12em]"
        >
          RERA
        </text>
      </g>
    </>
  ),
  loop: (
    <>
      <path d={SPIRAL} stroke="currentColor" pathLength={1} className={DRAW} />
      <g data-motion-only="">
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
      <circle
        cx="186"
        cy="123"
        r="6"
        className="fill-clay motion-safe:hidden"
      />
    </>
  ),
};

export function MoatArt({ variant }: { variant: Variant }) {
  return (
    <svg
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
