import { type CSSProperties, useEffect, useRef, useState } from "react";
import { calls, survey } from "../content/hero";
import { cx } from "../lib/cx";
import { useStill } from "../lib/motion";
import type { CallPhase } from "./HeroCall";

// The hero's ground, drawn like an architect's sheet: graph paper that clears
// behind the copy (styles.css, survey-sheet), registration marks at its corners
// and a title strip with the north point, fading out before the proof band.
// SurveyPlan lies under the call card: the typical 2 BHK the ready buyer asks
// about, sized to the card, entrance up, so the front door, living room and
// kitchen show above it (in view on a laptop's first screen) and the bedrooms,
// balcony and width below. It plots itself once when first on screen (walls, then
// windows and the door), then follows the call: his budget pins a tag, the
// configuration lights the rooms, the booked visit lands a pin at the door; the
// exploring buyer's call leaves it as quiet linework. Pause finishes the drawing
// and freezes its lights with the card; reduced motion and the server render show
// the finished ready-buyer frame: drawn, lit, the visit pinned. Decorative and
// aria-hidden: the card's own label tells this story; the strip says "Illustrative".

type Plot = "wait" | "run" | "done";

const motionOk = () =>
  typeof window !== "undefined" &&
  "IntersectionObserver" in window &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Plan geometry. Outer walls 9px, partitions 4px; the bands above and below the
// card come from styles.css (--survey-top, --survey-foot), so rooms reach under it.
// The door and its swing fit the top band, clear of the card.
const WALL = 9;
const DOOR = 38; // the front door, 42% along the top wall
const DOOR_AT = "42%";
const KITCHEN = "calc(var(--survey-top) + 150px)"; // the kitchen's depth
const BED = "calc(var(--survey-foot) + 150px)"; // the bedrooms', from the foot

const PARTITIONS: CSSProperties[] = [
  { left: "calc(62% - 2px)", top: 0, width: 4, height: KITCHEN },
  { right: 0, top: KITCHEN, width: "38%", height: 4 },
  { left: "calc(40% - 2px)", bottom: 0, width: 4, height: BED },
  { left: "calc(60% - 2px)", bottom: 0, width: 4, height: BED },
  { left: 0, bottom: BED, width: "40%", height: 4 },
  { right: 0, bottom: BED, width: "40%", height: 4 },
];

// Windows through the outer wall: a frame with a pane line down its middle.
const WINDOWS: CSSProperties[] = [
  { left: 0, top: 30, width: WALL, height: 150 },
  { right: 0, top: 40, width: WALL, height: 90 },
  { left: 0, bottom: 24, width: WALL, height: 140 },
  { right: 0, bottom: 24, width: WALL, height: 140 },
  { left: "8%", bottom: 0, width: "24%", height: WALL },
  { left: "68%", bottom: 0, width: "24%", height: WALL },
];

// Top band first, so the rooms light in reading order.
const { rooms } = survey;
const ROOMS: { label: string; wash: CSSProperties; at: CSSProperties }[] = [
  {
    label: rooms.living,
    wash: { left: 0, top: 0, width: "62%", height: 300 },
    at: { left: 21, top: 19 },
  },
  {
    label: rooms.kitchen,
    wash: { left: "62%", top: 0, right: 0, height: KITCHEN },
    at: { left: "calc(62% + 14px)", top: 19 },
  },
  {
    label: rooms.bed1,
    wash: { left: 0, bottom: 0, width: "40%", height: BED },
    at: { left: 21, bottom: 19 },
  },
  {
    label: rooms.balcony,
    wash: { left: "40%", bottom: 0, width: "20%", height: BED },
    at: { left: "50%", bottom: 19, translate: "-50% 0" },
  },
  {
    label: rooms.bed2,
    wash: { left: "60%", bottom: 0, right: 0, height: BED },
    at: { left: "calc(60% + 14px)", bottom: 19 },
  },
];

const CORNERS = [
  "top-[12px] left-[10px] -translate-x-1/2 -translate-y-1/2 md:left-[20px]",
  "top-[12px] right-[10px] translate-x-1/2 -translate-y-1/2 md:right-[20px]",
  "bottom-[52px] left-[10px] -translate-x-1/2 translate-y-1/2 md:left-[20px]",
  "bottom-[52px] right-[10px] translate-x-1/2 translate-y-1/2 md:right-[20px]",
];

const LABEL = "font-mono text-[11px] leading-none";
const CAPS = "uppercase tracking-[0.1em]";

export function SurveyGround() {
  return (
    <div
      aria-hidden="true"
      className="survey -z-20 pointer-events-none absolute inset-0 select-none overflow-hidden"
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
          "absolute inset-x-[22px] bottom-[16px] flex h-[36px] items-center gap-[8px] whitespace-nowrap text-stone md:inset-x-[34px]",
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
        <span className={cx(CAPS, "ml-auto max-sm:hidden")}>
          {survey.illustrative}
        </span>
      </div>
    </div>
  );
}

export function SurveyPlan({ phase }: { phase: CallPhase }) {
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

  // What the showing call has captured so far lights the plan; as it fades out,
  // so do the lights. The exploring buyer's fields are no cue, so it stays dark.
  const got = calls[phase.call]?.captured.slice(0, phase.captured) ?? [];
  const on = phase.stage !== "leaving";
  const lit = on && got.includes(survey.cues.rooms);
  const tagged = on && got.includes(survey.cues.budget);
  const booked = lit && phase.stage === "outcome";
  // Lights ease once the plan is on screen; before its plot they switch unseen.
  const glide = plot !== "wait" && "duration-700 ease-(--ease-soft)";
  const drawn = still ? "done" : plot;

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-plot={drawn}
      className="survey survey-plan group/plan -z-10 pointer-events-none select-none data-[plot=wait]:invisible max-sm:hidden"
    >
      {ROOMS.map((r, i) => (
        <span
          key={r.label}
          className={cx(
            "absolute bg-clay/[0.06] transition-opacity",
            glide,
            !lit && "opacity-0",
          )}
          style={{ ...r.wash, transitionDelay: lit ? `${i * 90}ms` : "0ms" }}
        />
      ))}

      {/* the walls: the outer ring, then the partitions */}
      <div
        className={cx(
          "absolute inset-0 border-(--survey-wall) border-[9px]",
          "group-data-[plot=run]/plan:animate-[survey-wipe_2.4s_var(--ease-soft)_0.4s_both]",
        )}
      >
        {PARTITIONS.map((box) => (
          <span
            key={JSON.stringify(box)}
            className="absolute bg-(--survey-wall)"
            style={box}
          />
        ))}
      </div>

      {/* the openings, cut into the walls: windows, the door, the balcony's parapet */}
      <div
        className={cx(
          "absolute inset-0",
          "group-data-[plot=run]/plan:animate-[ro-fade_900ms_ease-out_2.2s_both]",
        )}
      >
        {WINDOWS.map((box) => (
          <span
            key={JSON.stringify(box)}
            className="absolute border border-(--survey-draw) bg-paper"
            style={box}
          >
            <span
              className={cx(
                "absolute bg-(--survey-draw)",
                box.width === WALL
                  ? "inset-y-0 left-1/2 w-px -translate-x-1/2"
                  : "inset-x-0 top-1/2 h-px -translate-y-1/2",
              )}
            />
          </span>
        ))}
        <span
          className="absolute top-0 h-[9px] bg-paper"
          style={{ left: DOOR_AT, width: DOOR }}
        />
        <span className="absolute bottom-0 left-[calc(40%+2px)] h-[9px] w-[calc(20%-4px)] border-(--survey-draw) border-b bg-paper">
          <span className="absolute inset-x-0 top-0 border-(--survey-draw) border-t border-dashed" />
        </span>
      </div>

      <svg
        aria-hidden="true"
        viewBox={`0 0 ${DOOR} ${DOOR}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        className={cx(
          "absolute text-(--survey-swing)",
          "group-data-[plot=run]/plan:animate-[ro-fade_900ms_ease-out_2.8s_both]",
        )}
        style={{ left: DOOR_AT, top: WALL, width: DOOR, height: DOOR }}
      >
        <path d={`M0.65 0V${DOOR}`} />
        <path
          d={`M0.65 ${DOOR - 0.65}A${DOOR - 0.65} ${DOOR - 0.65} 0 0 0 ${DOOR} 0`}
          strokeDasharray="3 3.5"
        />
      </svg>

      {/* the width, dimensioned below the plan: extension lines, 45° ticks, figure */}
      <div className="group-data-[plot=run]/plan:animate-[ro-fade_600ms_ease-out_2.2s_both]">
        <span className="absolute top-[calc(100%+4px)] left-0 h-[14px] w-px bg-(--survey-draw)" />
        <span className="absolute top-[calc(100%+4px)] right-0 h-[14px] w-px bg-(--survey-draw)" />
      </div>
      <div
        className={cx(
          "absolute inset-x-0 top-[calc(100%+11px)] h-px bg-(--survey-draw)",
          "group-data-[plot=run]/plan:animate-[survey-grow_1.2s_var(--ease-soft)_2.4s_both]",
        )}
      >
        <span className="-top-[4px] absolute left-0 h-[9px] w-px rotate-45 bg-ink-2" />
        <span className="-top-[4px] absolute right-0 h-[9px] w-px rotate-45 bg-ink-2" />
        <span
          className={cx(
            LABEL,
            "-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 whitespace-nowrap bg-paper px-[6px] text-stone",
            "group-data-[plot=run]/plan:animate-[ro-fade_600ms_ease-out_3.2s_both]",
          )}
        >
          {survey.width}
        </span>
      </div>

      {ROOMS.map((r, i) => (
        <span
          key={r.label}
          className={cx(
            LABEL,
            CAPS,
            "absolute whitespace-nowrap text-stone transition-opacity",
            glide,
            !lit && "opacity-0",
          )}
          style={{
            ...r.at,
            transitionDelay: lit ? `${200 + i * 90}ms` : "0ms",
          }}
        >
          {r.label}
        </span>
      ))}

      <span
        className={cx(
          LABEL,
          "absolute top-[15px] right-[21px] inline-flex items-center gap-[6px] whitespace-nowrap rounded-full border border-clay/35 bg-paper px-[8px] py-[4px] text-clay-deep transition-[opacity,scale]",
          glide,
          !tagged && "scale-[1.15] opacity-0",
        )}
      >
        <span className="size-[5px] rounded-full bg-clay" />
        {survey.budget}
      </span>

      <span
        className={cx(
          "-translate-x-1/2 absolute top-[-0.5px] size-[10px] rounded-full bg-clay shadow-[0_0_0_2px_var(--color-paper),0_0_0_7px_color-mix(in_oklab,var(--color-clay)_18%,transparent)] transition-[opacity,translate]",
          glide,
          !booked && "-translate-y-[14px] opacity-0",
        )}
        style={{ left: `calc(${DOOR_AT} + ${DOOR / 2}px)` }}
      />
      <span
        className={cx(
          LABEL,
          "-translate-x-1/2 absolute bottom-[calc(100%+12px)] whitespace-nowrap text-clay-deep transition-opacity",
          glide,
          !booked && "opacity-0",
        )}
        style={{
          left: `calc(${DOOR_AT} + ${DOOR / 2}px)`,
          transitionDelay: booked ? "250ms" : "0ms",
        }}
      >
        {survey.visit}
      </span>
    </div>
  );
}
