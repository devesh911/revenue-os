import {
  type CSSProperties,
  type FocusEvent,
  Fragment,
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { howItWorks, howSteps } from "../content/beforeCall";
import { brand } from "../content/site";
import { MonoLabel } from "../design/MonoLabel";
import { cx } from "../lib/cx";
import { reveal } from "../lib/reveal";
import { type Sequence, useSequence } from "../lib/sequence";
import { BrandMark } from "./BrandMark";
import {
  ASK,
  HOLD as BRIEF_HOLD,
  STARTS as BRIEF_STARTS,
  CallBrief,
  PLAN,
  READY,
  SAVED,
  SCORE,
} from "./CallBrief";
import {
  IntentEvidence,
  HOLD as STUDY_HOLD,
  STARTS as STUDY_STARTS,
} from "./IntentEvidence";

// How it works' five steps beside a product window. The steps are vertical tabs
// (title, then its description once selected, over a thin rule that fills with clay
// as the step plays); the window frames the two approved studies — the call brief
// and the intent study — on a clay brand plate. One timeline drives both: each step
// plays a run of one study's own beats (RUNS), so neither study runs a clock of its
// own, and the window scrolls itself to each beat's element like a camera. It plays
// only while the window is on screen; it advances on its own until a visitor chooses
// a step, which then replays. A mouse over the step list, or keyboard focus in the
// list or the window, holds the current step (it replays instead of moving on).
// Server render, reduced motion and Pause before play show the finished story: the
// last step, the brief at "Ready".
type Pane = "brief" | "study";
const TIMES = {
  brief: [BRIEF_STARTS, BRIEF_HOLD],
  study: [STUDY_STARTS, STUDY_HOLD],
} as const;
// What each step plays: a run of one study's beats, in story order.
export const RUNS: ReadonlyArray<readonly [Pane, number, number]> = [
  ["brief", 0, 1], // his enquiry, read the moment it lands
  ["brief", 2, ASK - 1], // the inventory match, his history, his note
  ["brief", ASK, SAVED], // the question to Priya; her answer, saved
  ["study", 0, STUDY_STARTS.length - 1], // his intent, signal by signal, to "Call now"
  ["brief", PLAN, READY], // the call plan, then Ready
];
const READ = 4000; // a step's last beat stays up this much longer, so the step can be read

// Every beat, in order: its step, its study, the study's own beat, how long it lasts.
// A study's final beat lasts its hold (already a reading pause); other step-ending
// beats add READ.
interface Beat {
  step: number;
  pane: Pane;
  beat: number;
  ms: number;
}
const BEATS: Beat[] = RUNS.flatMap(([pane, from, to], step) => {
  const [starts, hold] = TIMES[pane];
  const final = starts.length - 1;
  return Array.from({ length: to - from + 1 }, (_, k) => {
    const beat = from + k;
    const own =
      beat === final ? hold : (starts[beat + 1] ?? 0) - (starts[beat] ?? 0);
    return {
      step,
      pane,
      beat,
      ms: beat === to && beat < final ? own + READ : own,
    };
  });
});
const STARTS = BEATS.map((_, i) =>
  BEATS.slice(0, i).reduce((t, b) => t + b.ms, 0),
);
const HOLD = BEATS.at(-1)?.ms ?? 0;
// Each step's first and last beat.
const RANGES = RUNS.map((_, s) => {
  const first = BEATS.findIndex((b) => b.step === s);
  return [first, first + BEATS.filter((b) => b.step === s).length - 1] as const;
});
// Where each beat's fill starts and ends on its step's rule, as shares of the step.
const FILL = BEATS.map((b, i) => {
  const [first, last] = RANGES[b.step] ?? [i, i];
  const from = STARTS[first] ?? 0;
  const length = (STARTS[last] ?? 0) + (BEATS[last]?.ms ?? 0) - from;
  const at = (STARTS[i] ?? 0) - from;
  return [at / length, (at + b.ms) / length] as const;
});
const REST: Beat = { step: 0, pane: "brief", beat: 0, ms: 0 };
// What a hidden study shows: the brief one beat before its plan (so step 5 animates
// only the plan), the intent study its finished frame.
const still = (step: number): Sequence => ({
  step,
  resetting: false,
  playing: false,
  settled: true,
});
const BRIEF_REST = still(SCORE);
const STUDY_REST = still(STUDY_STARTS.length - 1);

const N = howSteps.length;
const KEYS: Record<string, (i: number) => number> = {
  ArrowDown: (i) => (i + 1) % N,
  ArrowRight: (i) => (i + 1) % N,
  ArrowUp: (i) => (i + N - 1) % N,
  ArrowLeft: (i) => (i + N - 1) % N,
  Home: () => 0,
  End: () => N - 1,
};
const DOTS = ["a", "b", "c"];
// A title of two sentences keeps each to a line of its own where it fits, so "Your
// team answers once. Every call knows." breaks between them, never inside one.
const sentences = (title: string) => {
  const parts = title.split(/(?<=\.) /);
  return parts.length < 2
    ? title
    : parts.map((part, k) => (
        <Fragment key={part}>
          {k > 0 && " "}
          <span className="inline-block">{part}</span>
        </Fragment>
      ));
};

// The camera: scroll the pane so the beat's elements (every one marked with it, as
// one box: the intent study frames its score with "Call now") sit whole under the
// pinned header, moving as little as it can (to their top, if they are taller than
// the view). A beat with no element of its own stays put; the first beat goes back
// to the top. Places are read from layout (offsetTop up to the pane), not boxes on
// screen, which an entering card's own slide-in would shift; hidden ones don't count.
const GAP = 16;
function follow(pane: HTMLElement, beat: number, smooth: boolean) {
  const els = [
    ...pane.querySelectorAll<HTMLElement>(`[data-beat~="${beat}"]`),
  ].filter((el) => el.offsetParent);
  if (!els.length && beat > 0) return;
  let top = 0;
  if (els.length) {
    const pin =
      pane.querySelector<HTMLElement>("[data-pin]")?.offsetHeight ?? 0;
    let [y, end] = [Number.POSITIVE_INFINITY, 0];
    for (const el of els) {
      let t = 0;
      for (let n: Element | null = el; n instanceof HTMLElement && n !== pane; )
        [t, n] = [t + n.offsetTop, n.offsetParent];
      [y, end] = [Math.min(y, t), Math.max(end, t + el.offsetHeight)];
    }
    top = Math.min(
      y - pin - GAP,
      Math.max(pane.scrollTop, end + GAP - pane.clientHeight),
    );
  }
  pane.scrollTo({ top, behavior: smooth ? "smooth" : "instant" });
}

export function HowSteps() {
  const id = useId();
  const panelId = `${id}panel`;
  const tabId = (i: number) => `${id}tab${i}`;
  const list = useRef<HTMLDivElement>(null);
  const win = useRef<HTMLDivElement>(null);
  const briefPane = useRef<HTMLDivElement>(null);
  const studyPane = useRef<HTMLDivElement>(null);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const [chosen, setChosen] = useState<number | null>(null); // a click or key: stops auto-advance for the visit
  const [hoverAt, setHoverAt] = useState<number | null>(null); // mouse over the step list
  const [focusAt, setFocusAt] = useState<number | null>(null); // keyboard focus in the list or the window
  const hold = chosen ?? hoverAt ?? focusAt;
  const seq = useSequence(win, STARTS, HOLD, {
    loop: hold === null ? undefined : RANGES[hold],
  });
  const now = BEATS[seq.step] ?? REST;
  const active = chosen ?? now.step;
  const brief = now.pane === "brief" ? { ...seq, step: now.beat } : BRIEF_REST;
  const study = now.pane === "study" ? { ...seq, step: now.beat } : STUDY_REST;

  // Follow the story: smoothly while it plays forward in one pane; instantly on a
  // pane swap (the cross-fade covers it), a replay or wrap (the reset fade covers
  // it), a choice, reduced motion and the first paint.
  const shot = useRef<{ pane: Pane; beat: number } | null>(null);
  const jump = useRef(false); // a choice: the next move is instant
  useLayoutEffect(() => {
    const prev = shot.current;
    if (prev?.pane === now.pane && prev.beat === now.beat) return;
    shot.current = { pane: now.pane, beat: now.beat };
    const smooth =
      !jump.current &&
      seq.playing &&
      prev?.pane === now.pane &&
      now.beat > prev.beat;
    jump.current = false;
    const pane = (now.pane === "brief" ? briefPane : studyPane).current;
    if (pane) follow(pane, now.beat, smooth);
  }, [now.pane, now.beat, seq.playing]);

  // The panes are a fixed height, so only a new width (or the fonts arriving) moves
  // the current beat's element: put it back in view.
  useEffect(() => {
    const again = () => {
      const at = shot.current;
      const pane = (at?.pane === "study" ? studyPane : briefPane).current;
      if (at && pane) follow(pane, at.beat, false);
    };
    document.fonts?.ready.then(again);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(again);
    for (const p of [briefPane.current, studyPane.current])
      if (p) ro.observe(p);
    return () => ro.disconnect();
  }, []);

  const choose = (i: number) => {
    jump.current = true;
    setChosen(i);
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const to = KEYS[e.key]?.(i);
    if (to === undefined) return;
    e.preventDefault();
    choose(to);
    tabs.current[to]?.focus();
  };
  const onFocus = () => setFocusAt((f) => f ?? active);
  const onBlur = (e: FocusEvent) => {
    const to = e.relatedTarget as Node | null;
    if (!list.current?.contains(to) && !win.current?.contains(to))
      setFocusAt(null);
  };

  const [from = 0, to = 1] = FILL[seq.step] ?? [];
  const fill =
    chosen !== null || seq.settled ? (
      <span className="absolute inset-0 rounded-full bg-clay" />
    ) : (
      <span
        key={seq.step}
        className="absolute inset-0 origin-top animate-[how-fill_var(--dur)_linear_both] rounded-full bg-clay"
        style={
          {
            "--from": from,
            "--to": to,
            "--dur": `${now.ms}ms`,
          } as CSSProperties
        }
      />
    );
  const pane = (on: boolean) =>
    cx(
      "relative h-full overflow-hidden transition-[opacity,visibility] duration-300",
      on ? "delay-300 motion-reduce:delay-0" : "invisible opacity-0",
    );

  return (
    <div
      {...reveal()}
      data-paused={(!seq.playing && !seq.settled) || undefined}
      data-settled={seq.settled || undefined}
      className="mt-[56px] grid md:mt-[72px] lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-x-[64px] xl:gap-x-[96px]"
    >
      <div
        ref={list}
        role="tablist"
        aria-orientation="vertical"
        aria-label={howItWorks.stepsLabel}
        onPointerEnter={(e) => e.pointerType === "mouse" && setHoverAt(active)}
        onPointerLeave={() => setHoverAt(null)}
        onFocus={onFocus}
        onBlur={onBlur}
        className="grid content-start gap-[16px] md:-ml-[16px] md:gap-[22px] lg:pt-[16px] xl:-ml-[28px]"
      >
        {howSteps.map((s, i) => {
          const on = i === active;
          return (
            <button
              key={s.title}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={tabId(i)}
              aria-selected={on}
              aria-controls={panelId}
              aria-labelledby={`${id}title${i}`}
              aria-describedby={on ? `${id}desc${i}` : undefined}
              tabIndex={on ? 0 : -1}
              onClick={() => choose(i)}
              onKeyDown={(e) => onKey(e, i)}
              className={cx(
                "group relative grid rounded-[6px] py-[10px] pl-[18px] text-left md:pl-[16px] xl:pl-[28px]",
                on ? "cursor-default" : "cursor-pointer",
              )}
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-[3px] overflow-hidden rounded-full bg-mute/45 transition-colors duration-200 group-hover:bg-mute"
              >
                {on && fill}
              </span>
              <span
                id={`${id}title${i}`}
                className={cx(
                  "text-balance font-serif text-[20px] leading-[1.3] tracking-[-0.01em] transition-colors duration-200 md:text-[22px] xl:text-[24px]",
                  on ? "text-ink" : "text-stone group-hover:text-ink-2",
                )}
              >
                {sentences(s.title)}
              </span>
              <span
                aria-hidden={on ? undefined : "true"}
                className={cx(
                  "grid transition-[grid-template-rows,opacity] duration-[400ms] ease-soft",
                  on ? "grid-rows-[1fr]" : "grid-rows-[0fr] opacity-0",
                )}
              >
                <span className="overflow-hidden">
                  <span
                    id={`${id}desc${i}`}
                    className="block max-w-[44ch] text-pretty pt-[10px] text-[15.5px] text-ink-2 leading-[1.65]"
                  >
                    {s.body}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative isolate mt-[36px] max-w-[668px] md:mt-[48px] lg:mt-0 lg:max-w-none">
        <div
          aria-hidden="true"
          className="how-plate absolute right-0 -bottom-[16px] -top-[24px] -z-10 w-[62%] overflow-hidden rounded-[16px] md:-top-[36px] md:-bottom-[28px] md:w-[60%] lg:-top-[24px] lg:w-[66%] xl:-top-[132px] xl:w-[55%]"
        >
          <span className="absolute inset-0 bg-grain" />
          {/* the mark's voice arcs, drawn large and still, in the band the window
              leaves showing above it */}
          <svg
            aria-hidden="true"
            className="absolute inset-0 size-full"
            viewBox="0 0 400 640"
            preserveAspectRatio="xMidYMid slice"
            fill="none"
          >
            {[
              "M109 -38A120 120 0 0 1 109 158",
              "M155 -104A200 200 0 0 1 155 224",
              "M201 -169A280 280 0 0 1 201 289",
            ].map((d) => (
              <path
                key={d}
                d={d}
                className="stroke-paper/15"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
              />
            ))}
          </svg>
        </div>
        <div
          ref={win}
          role="tabpanel"
          id={panelId}
          aria-labelledby={tabId(active)}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the tabs pattern makes the panel a tab stop
          tabIndex={0}
          onFocus={onFocus}
          onBlur={onBlur}
          className="@container how-window relative mr-[14px] overflow-hidden rounded-[16px] border border-line bg-paper md:mr-[28px]"
        >
          <div className="flex h-[40px] items-center border-line border-b bg-paper-2/60 md:h-[42px]">
            <span
              aria-hidden="true"
              className="ml-[14px] flex gap-[6px] md:ml-[16px] md:gap-[8px]"
            >
              {DOTS.map((d) => (
                <span
                  key={d}
                  className="size-[8px] rounded-full bg-mute/50 md:size-[10px]"
                />
              ))}
            </span>
            <span
              aria-hidden="true"
              className="-mb-px ml-[14px] flex h-[28px] items-center gap-[8px] self-end rounded-t-[8px] border border-line border-b-0 bg-paper px-[10px] md:ml-[18px] md:h-[31px] md:px-[12px]"
            >
              <BrandMark
                live={seq.playing}
                className="size-[14px] shrink-0 text-ink"
              />
              <span className="hidden font-medium text-[13.5px] text-ink tracking-[-0.005em] @min-[440px]:inline">
                {brand}
              </span>
            </span>
            <MonoLabel className="mr-[10px] ml-auto rounded-full border border-line px-[7px] py-[3px] text-[10px] text-stone uppercase tracking-[0.1em] md:mr-[12px] md:px-[8px] md:text-[10.5px]">
              {howItWorks.illustrative}
            </MonoLabel>
          </div>
          <div className="grid h-[440px] [--pin:0px] *:[grid-area:1/1] md:h-[480px]">
            <div
              ref={briefPane}
              data-pane="brief"
              className={pane(now.pane === "brief")}
            >
              <CallBrief at={brief} />
            </div>
            <div
              ref={studyPane}
              data-pane="study"
              className={pane(now.pane === "study")}
            >
              <IntentEvidence at={study} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
