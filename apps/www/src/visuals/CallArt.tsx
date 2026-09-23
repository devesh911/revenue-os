import { useRef } from "react";
import { useLiveSvg } from "../lib/motion";

// The brand mark at poster scale for the closing clay panel: the lead (a paper
// dot) inside three ink arcs on faint orbits — a call reaching out. Static first:
// the arcs rest solid, fully drawn. Motion is a slow paper ripple leaving the dot,
// plus a one-shot draw-on of the arcs (inner first) when the enclosing reveal
// block appears; it keys off that block's data-shown, so without a reveal (no JS,
// reduced motion) nothing is ever undrawn, and it is a transition, not a keyframe,
// so the pause switch can't strand it half drawn. The ripple pauses off screen and
// with the page-wide pause switch (useLiveSvg). Decorative — aria-hidden.
const C = 190;
const DOT = 32;
const ARCS = [80, 128, 176];
const UNDRAWN =
  "[html[data-motion]_[data-reveal]:not([data-shown])_&]:[stroke-dashoffset:1]";

export function CallArt({ className }: { className?: string }) {
  const svg = useRef<SVGSVGElement>(null);
  useLiveSvg(svg);
  return (
    <svg
      ref={svg}
      viewBox="0 0 380 380"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {ARCS.map((r) => (
        <circle
          key={r}
          cx={C}
          cy={C}
          r={r}
          strokeWidth="1.25"
          className="stroke-ink/15"
        />
      ))}
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
          <path
            key={r}
            d={`M${C + d} ${C - d}a${r} ${r} 0 0 1 0 ${2 * d}`}
            pathLength={1}
            strokeDasharray="1 2"
            strokeWidth="8"
            strokeLinecap="round"
            className={`stroke-ink transition-[stroke-dashoffset] duration-[1100ms] ease-[var(--ease-soft)] ${UNDRAWN}`}
            style={{ transitionDelay: `${400 + i * 220}ms` }}
          />
        );
      })}
    </svg>
  );
}
