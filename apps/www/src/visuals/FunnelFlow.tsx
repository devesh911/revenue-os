import { useRef } from "react";
import { workflow } from "../content/workflow";
import { cx } from "../lib/cx";
import { useLiveSvg } from "../lib/motion";
import { reveal } from "../lib/reveal";

// The engine, drawn. Enquiries (paper dots) enter the three-step track; step 02,
// where the call learns the buyer's budget, location and timeline, sorts each one
// — clay leads run on through 03 to the site visit, olive leads drop into the
// follow-up loop under the track and re-enter until they are ready (then they turn
// clay and book). The viewBox is the content column at full width (1120px, which
// it is exactly from xl up); from lg StageGrid sets the steps as three equal
// columns on 56px gutters, and each node sits over its step column's centre (to
// within a few px at lg, where the whole figure scales down). At md the steps wrap
// 2 + 1 and the diagram stands apart as its own figure — the sequence, not a
// column header. Lines + dots live in a uniformly scaled viewBox; rings and labels
// are HTML placed by percentage so they stay crisp at every width. SMIL motion
// sits in [data-motion-only] and holds still off screen; reduced motion or the
// page-wide pause swaps it for three static dots at rest. Decorative beside the
// step copy, so aria-hidden.
const { steps, flow } = workflow;
const LAST = steps.length - 1;
const W = 1120; // viewBox width = the content column at full width
const GUTTER = 56; // StageGrid's column gutter (gap-x-[56px])
const COL = (W - LAST * GUTTER) / steps.length; // one step column at xl: 336
const node = (i: number) => COL / 2 + i * (COL + GUTTER);
const H = 196;
const Y = 64; // the track
const R = 44; // follow-up loop turn radius
const Y2 = Y + 2 * R; // the loop's return lane
const LX = node(0) - 50; // loop turn centres: just before 01 …
const RX = node(1) + 50; // … and just past 02

const LOOP = `A${R} ${R} 0 0 1 ${RX} ${Y2} H${LX} A${R} ${R} 0 0 1 ${LX} ${Y}`;
const HIGH = `M0 ${Y} H${W}`;
const LOW = `M0 ${Y} H${RX} ${LOOP} H${W}`;
const LOW_LEN = W + 2 * (RX - LX) + 2 * Math.PI * R;
const REJOIN = LOW_LEN - (W - node(1)); // a followed-up lead's second pass through 02
const SPAN = LOW_LEN + 60; // one period, in track units (a beat of rest per lap)
const SPEED = 140; // track units per second: a high-intent lead crosses in 8s
const f = (d: number) => (d / SPAN).toFixed(4); // track distance → period fraction

// Seven leads, evenly phased through the period (every other one followed up).
// Negative begins, so the flow is already running on first paint.
const LEADS = Array.from({ length: 7 }, (_, i) => ({
  low: i % 2 === 1,
  phase: i / 7,
}));

function Lead({ low, phase }: { low: boolean; phase: number }) {
  const end = low ? LOW_LEN : W;
  const time = {
    dur: `${SPAN / SPEED}s`,
    begin: `${(-phase * SPAN) / SPEED}s`,
    repeatCount: "indefinite",
  };
  const tint = (on: number, off?: number) => (
    <animate
      {...time}
      attributeName="opacity"
      calcMode="discrete"
      values={off ? "0;1;0" : "0;1"}
      keyTimes={off ? `0;${f(on)};${f(off)}` : `0;${f(on)}`}
    />
  );
  return (
    <g opacity={0}>
      <animateMotion
        {...time}
        path={low ? LOW : HIGH}
        calcMode="linear"
        keyPoints="0;1;1"
        keyTimes={`0;${f(end)};1`}
      />
      <animate
        {...time}
        attributeName="opacity"
        values="0;1;1;0;0"
        keyTimes={`0;${f(48)};${f(end - 72)};${f(end)};1`}
      />
      <circle r={4.5} className="fill-paper" />
      {low && (
        <circle r={4.5} className="fill-olive" opacity={0}>
          {tint(node(1), REJOIN)}
        </circle>
      )}
      <circle r={4.5} className="fill-clay" opacity={0}>
        {tint(low ? REJOIN : node(1))}
      </circle>
    </g>
  );
}

// HTML overlay positions: x/y as % of the scaled box; labels keep a fixed px gap
// from the lines so they never collide with the fixed-size rings on tablets. Rings
// are opaque (ink + the panel's grain, so no darker disc) and sit over the SVG:
// dots pass behind them, and 02 recolours its lead out of sight.
const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const label =
  "absolute -translate-y-1/2 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.12em]";
const aboveTrack = { top: `calc(${pct(Y, H)} - 32px)` };

export function FunnelFlow({ className }: { className?: string }) {
  const svg = useRef<SVGSVGElement>(null);
  useLiveSvg(svg);
  return (
    <div
      aria-hidden="true"
      {...reveal(80)}
      className={cx("relative hidden md:block", className)}
    >
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        fill="none"
        aria-hidden="true"
        className="block h-auto w-full overflow-visible"
      >
        <path
          d={HIGH}
          className="stroke-paper/20"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={`M${node(LAST)} ${Y} H${W} m-7 -5 l7 5 l-7 5`}
          className="stroke-clay"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={`M${RX} ${Y} ${LOOP}`}
          className="stroke-olive"
          strokeWidth={1.5}
          strokeDasharray="0.5 6"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <g className="motion-safe:hidden [html[data-still]_&]:inline">
          <circle cx={LX - R - 10} cy={Y} r={4.5} className="fill-paper" />
          <circle
            cx={(LX + RX) / 2 - 30}
            cy={Y2}
            r={4.5}
            className="fill-olive"
          />
          <circle
            cx={(node(1) + node(2)) / 2}
            cy={Y}
            r={4.5}
            className="fill-clay"
          />
        </g>
        <g data-motion-only className="[html[data-still]_&]:hidden">
          {LEADS.map((lead) => (
            <Lead key={lead.phase} {...lead} />
          ))}
        </g>
      </svg>
      {steps.map((s, i) => (
        <span
          key={s.tag}
          className="absolute grid size-[34px] -translate-1/2 place-items-center rounded-full border border-paper/20 bg-grain bg-ink font-mono text-[11px] text-paper/70"
          style={{ left: pct(node(i), W), top: pct(Y, H) }}
        >
          <span className="size-[6px] rounded-full bg-paper/50" />
        </span>
      ))}
      <span className={cx(label, "left-0 text-paper/50")} style={aboveTrack}>
        {flow.entry}
      </span>
      <span className={cx(label, "right-0 text-clay")} style={aboveTrack}>
        {flow.exit}
      </span>
      <span
        className={cx(label, "-translate-x-1/2 text-olive-lift")}
        style={{
          left: pct((LX + RX) / 2, W),
          top: `calc(${pct(Y2, H)} + 26px)`,
        }}
      >
        <span className="font-sans text-[11.5px]">{flow.loopArrow}</span>{" "}
        {flow.loop}
      </span>
    </div>
  );
}
