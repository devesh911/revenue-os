import { useEffect, useRef, useState } from "react";
import { survey } from "../content/hero";
import { cx } from "../lib/cx";
import { useStill } from "../lib/motion";

// The hero's ground, drawn like an architect's sheet: a trimmed sheet of graph
// paper (styles.css, survey-sheet), clear behind the copy, on a faintly darker
// margin that reaches up behind the 64px nav (a flat shadow, so the nav sits on it
// too), with registration marks at its corners and, in the bottom margin, a title
// strip led by the north point. SurveyPlan is the typical 2 BHK the buyer asks
// about, lying under the result card: walls, windows with their pane lines, the
// sliding balcony door, and the door swings (the only clay), dimensioned across
// its width. It plots once, the first time it is on screen (a slow wipe, then the
// dimension and the swings), then stays still. Pause finishes the drawing; reduced
// motion and the server render show it drawn. Decorative and aria-hidden: the
// card's own label tells the story, and the strip says "Illustrative".

type Plot = "wait" | "run" | "done";

const motionOk = () =>
  typeof window !== "undefined" &&
  "IntersectionObserver" in window &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const CORNERS = [
  "top-[12px] left-[10px] -translate-x-1/2 -translate-y-1/2 md:left-[20px]",
  "top-[12px] right-[10px] translate-x-1/2 -translate-y-1/2 md:right-[20px]",
  "bottom-[52px] left-[10px] -translate-x-1/2 translate-y-1/2 md:left-[20px]",
  "bottom-[52px] right-[10px] translate-x-1/2 translate-y-1/2 md:right-[20px]",
];

const LABEL = "font-mono text-[11px] leading-none";

export function SurveyGround() {
  return (
    <div
      aria-hidden="true"
      className="-z-20 pointer-events-none absolute inset-0 select-none overflow-hidden bg-(--survey-margin) shadow-[0_-64px_0_var(--survey-margin)]"
    >
      <div className="survey-sheet absolute inset-x-[10px] top-[12px] bottom-[52px] md:inset-x-[20px]" />
      {CORNERS.map((at) => (
        <svg
          aria-hidden="true"
          key={at}
          viewBox="0 0 22 22"
          fill="none"
          stroke="currentColor"
          className={cx("absolute size-[22px] text-(--survey-mark)", at)}
        >
          <circle cx="11" cy="11" r="5.5" />
          <path d="M11 0v22M0 11h22" />
        </svg>
      ))}
      <div
        className={cx(
          LABEL,
          "absolute inset-x-[22px] bottom-[8px] flex h-[36px] items-center gap-[8px] whitespace-nowrap text-stone md:inset-x-[34px]",
        )}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          className="size-[15px] shrink-0 text-ink-2"
        >
          <circle
            cx="8"
            cy="8"
            r="7.3"
            stroke="currentColor"
            strokeOpacity="0.4"
          />
          <path
            d="M8 2.2 10.6 12 8 10.3 5.4 12Z"
            stroke="currentColor"
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
          <path d="M8 2.2V10.3L5.4 12Z" fill="currentColor" />
        </svg>
        <span className="min-w-0 truncate max-sm:hidden">{survey.title}</span>
        <span className="ml-auto uppercase tracking-[0.1em]">
          {survey.illustrative}
        </span>
      </div>
    </div>
  );
}

// The plan, 320 × 400 units, entrance at the foot. Walls: the outer ring, then the
// partitions, left open at every door. The front door is an opening cut in the
// foot; each window is a frame through the wall with a pane line, and the living
// room's balcony door slides (two offset panes). Each door swings a quarter arc.
const OUTER = "M0 0H320V400H0Z M8 8V392H312V8Z";
const PARTITIONS =
  "M158 8h4v142h-4z M8 150h110v4H8z M146 150h28v4h-28z M202 150h110v4H202z M206 224h4v76h-4z M206 350h4v42h-4z M210 290h102v4H210z M210 154h4v40h-4z";
const WINDOWS: [number, number, number, number][] = [
  [40, 0.6, 86, 6.8],
  [196, 0.6, 86, 6.8],
  [0.6, 40, 6.8, 70],
  [0.6, 262, 6.8, 80],
  [312.6, 40, 6.8, 70],
  [312.6, 200, 6.8, 60],
  [30, 392.6, 140, 6.8],
];
const PANES =
  "M40 4H126 M196 4H282 M4 40V110 M4 262V342 M316 40V110 M316 200V260 M30 394.6H106 M94 397.4H170";
const DOORS: [leaf: string, swing: string][] = [
  ["M250 392V352", "M250 352A40 40 0 0 1 290 392"],
  ["M118 150V122", "M118 122A28 28 0 0 1 146 150"],
  ["M202 150V122", "M202 122A28 28 0 0 0 174 150"],
];
// Line weights hold at any size (the walls, as fills, scale with the plan).
const LINE = { strokeWidth: 1.2, vectorEffect: "non-scaling-stroke" } as const;
const SWING = { ...LINE, strokeWidth: 1.3 } as const;

// On the first plot only: each part's entrance, keyed off the plan's data-plot.
const RUN = {
  plan: "group-data-[plot=run]/plan:animate-[survey-wipe_4.2s_var(--ease-soft)_0.4s_both]",
  ext: "group-data-[plot=run]/plan:animate-[ro-fade_1s_var(--ease-soft)_2.6s_both]",
  dim: "group-data-[plot=run]/plan:animate-[survey-grow_1.8s_var(--ease-soft)_2.8s_both]",
  swing:
    "group-data-[plot=run]/plan:animate-[ro-fade_1.6s_var(--ease-soft)_3.4s_both]",
  figure:
    "group-data-[plot=run]/plan:animate-[ro-fade_1.2s_var(--ease-soft)_3.8s_both]",
};

export function SurveyPlan({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const still = useStill();
  const [plot, setPlot] = useState<Plot>(() => (motionOk() ? "wait" : "done"));

  useEffect(() => {
    const el = ref.current;
    if (plot !== "wait" || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setPlot("run");
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [plot]);

  useEffect(() => {
    if (still) setPlot("done"); // paused mid-plot: finish the drawing, don't freeze it
  }, [still]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-plot={still ? "done" : plot}
      className={cx(
        "group/plan pointer-events-none absolute inset-0 select-none data-[plot=wait]:invisible",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 320 400"
        className={cx("absolute inset-0 size-full overflow-visible", RUN.plan)}
      >
        <path d={OUTER} fillRule="evenodd" className="fill-(--survey-wall)" />
        <path d={PARTITIONS} className="fill-(--survey-wall)" />
        <rect
          x="250"
          y="391.4"
          width="40"
          height="8.6"
          className="fill-paper"
        />
        <g className="fill-paper stroke-(--survey-draw)">
          {WINDOWS.map(([x, y, width, height]) => (
            <rect
              key={`${x},${y}`}
              x={x}
              y={y}
              width={width}
              height={height}
              {...LINE}
            />
          ))}
        </g>
        <path
          d={PANES}
          fill="none"
          className="stroke-(--survey-draw)"
          {...LINE}
        />
      </svg>
      <svg
        aria-hidden="true"
        viewBox="0 0 320 400"
        fill="none"
        stroke="currentColor"
        className={cx(
          "absolute inset-0 size-full overflow-visible text-(--survey-swing)",
          RUN.swing,
        )}
      >
        {DOORS.map(([leaf, swing]) => (
          <g key={leaf}>
            <path d={leaf} {...SWING} />
            <path d={swing} {...SWING} strokeDasharray="3 3.5" />
          </g>
        ))}
      </svg>

      {/* the width, dimensioned above the plan: extension lines, 45° ticks, figure */}
      <div className={RUN.ext}>
        <span className="absolute bottom-[calc(100%+4px)] left-0 h-[14px] w-px bg-(--survey-draw)" />
        <span className="absolute right-0 bottom-[calc(100%+4px)] h-[14px] w-px bg-(--survey-draw)" />
      </div>
      <div
        className={cx(
          "absolute inset-x-0 bottom-[calc(100%+12px)] h-px bg-(--survey-draw)",
          RUN.dim,
        )}
      >
        <span className="-top-[4px] absolute left-0 h-[9px] w-px rotate-45 bg-ink-2" />
        <span className="-top-[4px] absolute right-0 h-[9px] w-px rotate-45 bg-ink-2" />
        <span
          className={cx(
            LABEL,
            "-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 whitespace-nowrap bg-paper px-[6px] text-stone",
            RUN.figure,
          )}
        >
          {survey.width}
        </span>
      </div>
    </div>
  );
}
