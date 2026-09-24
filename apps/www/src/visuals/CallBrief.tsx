import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";
import { intentScore, intentSignals } from "../content/beforeCall";
import { type BriefRow, callBrief as c } from "../content/callBrief";
import { MonoLabel } from "../design/MonoLabel";
import {
  chime,
  setSound,
  unlockSound,
  useSound,
  useSoundReady,
} from "../lib/chime";
import { cx } from "../lib/cx";
import { useSequence } from "../lib/sequence";
import { CHECK, Icon } from "./Icon";

// Rohan's call brief writes itself before the call: each fact lands with a mono chip
// saying where it came from, while the rail on the left lights the source being read.
// The one fact the brochure lacks goes to Priya in sales, and her WhatsApp reply pops
// in front of the brief (with a soft chime while it plays, if sound is on) before it
// settles into the row and docks, small, under her source. Then the four intent
// signals add up one by one — a running total beside a bar that turns clay to olive —
// to the score, the six-step plan writes itself and the call starts.
// useSequence runs the loop; server render and reduced motion show the finished brief.
// Phones stack it under a caption bar that sticks below the nav; Priya's message hangs
// from that bar, her docked reply sits under it, and with no rail the Intent row adds
// the signals up itself.

// When each beat starts (ms). Priya's reply holds ~2.9 s, each signal ~0.8 s; a loop
// runs ~21.3 s with its fade.
const STARTS = [
  0, 800, 1800, 2800, 3800, 4900, 6400, 9300, 10300, 11100, 11900, 12700, 13600,
  14800, 17000,
];
const HOLD = 3900;
const ASK = 5; // the open question goes to Priya
const REPLY = 6; // her reply pops in front of the brief, with the chime
const SAVED = 7; // it settles into the row and the project's facts
const SIGNALS = 8; // beats 8–11 add one intent signal each
const SCORE = 12; // the sum, and the brief's Intent row (from 720px)
const PLAN = 13;
const READY = 14;
const CAPTION = [0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8, 8, 9, 10, 11];
const PROGRESS = [
  0, 0.12, 0.24, 0.36, 0.48, 0.56, 0.6, 0.68, 0.72, 0.74, 0.76, 0.78, 0.82,
  0.92, 1,
];
// Each rail source is read from its first beat until (not including) its second.
const RAIL = [
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [ASK, SAVED],
  [SIGNALS, PLAN],
] as const;
const PRIYA = 4; // her rail source, where her reply docks
// The running total after each signal, read from beforeCall.ts.
const RUNNING = intentSignals.map((_, i) =>
  intentSignals.slice(0, i + 1).reduce((total, s) => total + s.weight, 0),
);
const added = (step: number) =>
  Math.min(Math.max(step - SIGNALS + 1, 0), RUNNING.length);
const RAIL_ICONS = [
  "M8 2.5v7M5.2 6.8 8 9.6l2.8-2.8M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2",
  "M3.9 3h8.2a1.4 1.4 0 0 1 1.4 1.4v7.2a1.4 1.4 0 0 1-1.4 1.4H3.9a1.4 1.4 0 0 1-1.4-1.4V4.4A1.4 1.4 0 0 1 3.9 3zM2.5 6.6h11M2.5 9.8h11M6.4 6.6V13",
  "M2.9 8a5.1 5.1 0 1 0 1.5-3.6M2.7 2.8V5h2.2M8 5.3V8l1.9 1.3",
  "M4 2.5h5.3L12 5.2v8.3H4zM9.3 2.5v2.7H12M6 8.3h4M6 10.8h2.8",
  "M3 3.2h10c.3 0 .5.2.5.5v6.6c0 .3-.2.5-.5.5H7.2l-3 2.4v-2.4H3c-.3 0-.5-.2-.5-.5V3.7c0-.3.2-.5.5-.5z",
  "M2.8 11.2a5.2 5.2 0 1 1 10.4 0M8 11.2l2.5-3",
];
const SAVE = "M4.5 2.5h7v11L8 10.9l-3.5 2.6z";
const SPEAKER = "M2.5 6.2h2.2L8 3.5v9L4.7 9.8H2.5z";
const WAVES = "M10.6 5.6a3.2 3.2 0 0 1 0 4.8M12.4 3.9a5.6 5.6 0 0 1 0 8.2";
const MUTED = "M10.5 6.3l3.4 3.4M13.9 6.3l-3.4 3.4";
const WAVE = [0.45, 0.9, 0.6, 1, 0.4];
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

const KICK = "text-[11px] text-stone uppercase leading-[1.4] tracking-[0.12em]";
const VALUE = "text-[14.5px] text-ink leading-[1.45]";
const NOTE = "text-[12.5px] text-stone leading-[1.45]";
const CHIP =
  "whitespace-nowrap rounded-full border bg-paper px-[8px] pt-[5px] pb-[4px] text-[11px] leading-none";
const FLASH = "animate-[brief-flash_1.8s_var(--ease-soft)]";
const FLASH_OK =
  "[--brief-flash:color-mix(in_oklab,var(--color-olive)_14%,transparent)]";
// the Intent row lands at SIGNALS on narrow containers, at SCORE from 720px
const FLASH_NARROW = "@max-[720px]:animate-[brief-flash_1.8s_var(--ease-soft)]";
const FLASH_WIDE = "@min-[720px]:animate-[brief-flash_1.8s_var(--ease-soft)]";

// A fact writes itself in at its beat. Before that it is hidden with no transition,
// so the loop's reset snaps it back while the stage is faded out.
const writes = (on: boolean, delay = "delay-100") =>
  on
    ? cx("transition duration-700 ease-soft", delay)
    : "translate-y-[5px] opacity-0 blur-[3px]";
const fades = (on: boolean, delay = "") =>
  on ? cx("transition-opacity duration-500", delay) : "opacity-0";
// A meter's fill at a running `sum`: its share of 100, clay at the start turning
// olive (green) by the total. It snaps back to zero for the loop's reset.
const meter = (sum: number) =>
  ({
    transform: `scaleX(${sum / intentScore.outOf})`,
    backgroundColor: `color-mix(in oklab, var(--color-olive) ${Math.round((sum / intentScore.total) * 100)}%, var(--color-clay))`,
    transition: sum
      ? "transform 650ms var(--ease-soft), background-color 650ms var(--ease-soft)"
      : undefined,
  }) satisfies CSSProperties;

type Phase = "before" | "shown" | "gone";

export function CallBrief() {
  const ref = useRef<HTMLDivElement>(null);
  const { step, resetting, playing, settled } = useSequence(ref, STARTS, HOLD);
  // The chime marks Priya's reply arriving — only as it arrives, only while playing.
  const prev = useRef(step);
  useEffect(() => {
    if (playing && step === REPLY && prev.current !== REPLY) chime();
    prev.current = step;
  }, [step, playing]);

  const fade = cx(
    "transition-opacity duration-[450ms]",
    resetting && "opacity-0",
  );
  const reply: Phase =
    step < REPLY ? "before" : step === REPLY ? "shown" : "gone";
  return (
    <div
      ref={ref}
      data-settled={settled || undefined}
      className="@container relative overflow-clip rounded-[16px] border border-line bg-paper"
    >
      <p className="sr-only">{c.summary}</p>
      <div className="relative isolate grid grid-cols-[minmax(0,1fr)] gap-[8px] px-[16px] pt-[26px] pb-[24px] @min-[720px]:grid-cols-[minmax(180px,220px)_minmax(0,1fr)] @min-[1040px]:grid-cols-[minmax(200px,256px)_minmax(0,1fr)] @min-[720px]:gap-x-[36px] @min-[1040px]:gap-x-[48px] @min-[720px]:gap-y-[24px] @min-[720px]:px-[32px] @min-[1040px]:px-[40px] @min-[720px]:pt-[32px] @min-[720px]:pb-[56px]">
        <div
          aria-hidden="true"
          className="brief-ground pointer-events-none absolute inset-0 -z-10"
        />
        <div className="contents @min-[720px]:grid @min-[720px]:content-start @min-[720px]:gap-[40px] @min-[720px]:pt-[28px]">
          <div className="sticky top-[64px] z-[5] -mx-[16px] -mt-[26px] self-start border-line border-b bg-paper px-[16px] pt-[13px] pb-[12px] @min-[720px]:static @min-[720px]:m-0 @min-[720px]:border-0 @min-[720px]:bg-transparent @min-[720px]:p-0">
            <Captions at={CAPTION[step] ?? 0} className={fade} />
            <SoundSwitch className="absolute top-0 right-[6px] @min-[720px]:top-auto @min-[720px]:right-[12px] @min-[720px]:bottom-[6px]" />
            <PriyaMessage
              phase={reply}
              className="inset-x-[10px] top-[calc(100%+12px)] @min-[720px]:hidden"
            />
          </div>
          <Docked
            on={step >= SAVED}
            named
            className={cx("mt-[10px] max-w-[460px] @min-[720px]:hidden", fade)}
          />
          <Rail step={step} className={fade} />
        </div>
        <Deck step={step} reply={reply} className={fade} />
      </div>
    </div>
  );
}

function Captions({ at, className }: { at: number; className: string }) {
  return (
    <p
      aria-hidden="true"
      className={cx(
        "grid font-serif text-[17px] text-ink leading-[1.42] tracking-[-0.005em] @min-[720px]:min-h-[calc(4*1.42em+22px)] @min-[1040px]:min-h-[calc(3*1.42em+22px)] @min-[720px]:text-[19px]",
        className,
      )}
    >
      {c.captions.map((cap, i) => (
        <span
          key={cap.time}
          className={cx(
            "text-pretty [grid-area:1/1]",
            i === at
              ? "transition delay-[240ms] duration-700 ease-soft"
              : "translate-y-[6px] opacity-0 transition-opacity duration-200",
          )}
        >
          <MonoLabel className="mb-[8px] block text-[11px] text-stone leading-[1.4] tracking-[0.04em]">
            {cap.time}
          </MonoLabel>
          <span className="mr-[4px] align-[-0.12em] text-[1.3em] text-clay leading-[0]">
            {c.quote}
          </span>
          {cap.text}
        </span>
      ))}
    </p>
  );
}

// The study's own sound switch. It reads "off" until audio can actually play, and
// pressing it is itself the gesture that unlocks it. Hidden under reduced motion,
// where the brief stands still and never chimes.
function SoundSwitch({ className }: { className: string }) {
  const sound = useSound();
  const ready = useSoundReady();
  const on = sound && ready;
  // The press toggles what the visitor SAW when it began: the page's own unlock can
  // turn audio on between press and release, which must not flip the switch back off.
  const pressedOn = useRef<boolean | null>(null);
  return (
    <button
      type="button"
      aria-pressed={on}
      onPointerDown={() => {
        pressedOn.current = on;
      }}
      onKeyDown={() => {
        pressedOn.current = on;
      }}
      onClick={() => {
        const next = !(pressedOn.current ?? on);
        pressedOn.current = null;
        unlockSound(); // this press is a real gesture
        setSound(next);
      }}
      className={cx(
        "inline-flex min-h-[44px] cursor-pointer items-center gap-[7px] whitespace-nowrap rounded-full px-[10px] font-mono text-[11px] text-stone transition-colors duration-200 hover:text-ink focus-visible:outline-offset-[-4px] motion-reduce:hidden",
        className,
      )}
    >
      <Icon d={SPEAKER + (on ? WAVES : MUTED)} className="size-[14px]" />
      {c.sound.label}
      <span aria-hidden="true">{on ? c.sound.on : c.sound.off}</span>
    </button>
  );
}

function Rail({ step, className }: { step: number; className: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx("hidden gap-[14px] @min-[720px]:grid", className)}
    >
      <MonoLabel className={KICK}>{c.rail.title}</MonoLabel>
      <div>
        <ol className="relative grid gap-[2px] before:absolute before:top-[22px] before:bottom-[22px] before:left-[15.5px] before:w-px before:bg-line">
          {c.rail.items.map((item, i) => {
            const [from, to] = RAIL[i] ?? [0, 0];
            const active = step >= from && step < to;
            const done = step >= to;
            return (
              <li
                key={item.title}
                className="relative grid grid-cols-[32px_minmax(0,1fr)_14px] items-center gap-x-[12px] py-[6px]"
              >
                <span
                  className={cx(
                    "grid size-[32px] place-items-center rounded-[9px] border",
                    active
                      ? "border-clay/50 bg-[color-mix(in_oklab,var(--color-clay)_8%,var(--color-card))] text-clay-deep transition-colors duration-[400ms]"
                      : cx(
                          "border-line bg-card",
                          done
                            ? "text-ink-2 transition-colors duration-500"
                            : "text-mute",
                        ),
                  )}
                >
                  <Icon d={RAIL_ICONS[i] ?? ""} className="size-[16px]" />
                </span>
                <span className="grid min-w-0 gap-[1px]">
                  <span
                    className={cx(
                      "font-medium text-[13.5px] leading-[1.3]",
                      active ? "text-ink" : done ? "text-ink-2" : "text-stone",
                    )}
                  >
                    {item.title}
                  </span>
                  <MonoLabel className="text-pretty text-[11px] text-stone leading-[1.35]">
                    {item.detail}
                  </MonoLabel>
                </span>
                <span className="relative grid size-[14px] place-items-center">
                  <span
                    className={cx(
                      "size-[6px] rounded-full bg-clay",
                      active
                        ? "animate-[ro-blink_1.4s_ease-in-out_infinite]"
                        : "opacity-0",
                    )}
                  />
                  <Icon
                    d={CHECK}
                    className={cx(
                      "absolute inset-0 size-[14px] text-olive-deep",
                      fades(done, "delay-100"),
                    )}
                  />
                </span>
                {i === PRIYA && (
                  <Docked
                    on={step >= SAVED}
                    className="col-span-2 col-start-2 mt-[8px] mb-[4px]"
                  />
                )}
              </li>
            );
          })}
        </ol>
        <Score step={step} />
      </div>
    </div>
  );
}

// Under "Intent signals": each signal adds its weight in turn, the running total
// climbing beside a bar that turns from clay to olive, then the sum.
function Score({ step }: { step: number }) {
  return (
    <div className="-mt-[6px] ml-[15.5px] grid gap-[8px] border-line border-l pt-[8px] pl-[28.5px]">
      <Signals step={step} />
      <div className="flex items-center gap-[10px] border-line border-t pt-[9px]">
        <Bar step={step} className="flex-1" />
        <Total
          step={step}
          final={c.rail.total}
          className="text-[12.5px] text-ink"
        />
      </div>
    </div>
  );
}

// The four signals, each writing in (with a flash) on its beat over a placeholder.
function Signals({ step, className }: { step: number; className?: string }) {
  const n = added(step);
  return (
    <div className={cx("grid gap-[5px]", className)}>
      {c.rail.signals.map((s, i) => (
        <div key={s.label} className="grid *:[grid-area:1/1]">
          <span
            className={cx(
              "mt-[5px] block h-[7px] w-[72%] rounded-[4px] bg-paper-2",
              i < n && "opacity-0 transition-opacity duration-300",
            )}
          />
          <span
            className={cx(
              "-mx-[6px] grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-[8px] rounded-[5px] px-[6px] text-[12px] leading-[1.4]",
              i < n ? cx(FLASH, writes(true, "")) : writes(false),
            )}
          >
            <span className="text-ink-2">{s.label}</span>
            <MonoLabel className="text-[11.5px] text-olive-deep tabular-nums">
              {s.weight}
            </MonoLabel>
          </span>
        </div>
      ))}
    </div>
  );
}

// A 6px meter at the running total.
function Bar({ step, className }: { step: number; className: string }) {
  return (
    <span
      className={cx(
        "block h-[6px] overflow-hidden rounded-full bg-paper-2",
        className,
      )}
    >
      <span
        className="block h-full origin-left rounded-full"
        style={meter(RUNNING[added(step) - 1] ?? 0)}
      />
    </span>
  );
}

// The running total beside the bar: each sum rises in as its signal lands, then
// `final` takes over at SCORE. Stacked in one cell, so it holds the widest width.
function Total({
  step,
  final,
  className,
}: {
  step: number;
  final: string;
  className: string;
}) {
  const at = step >= SCORE ? RUNNING.length : added(step) - 1; // -1: none yet
  return (
    <MonoLabel
      className={cx(
        "grid justify-items-start whitespace-nowrap tabular-nums *:[grid-area:1/1]",
        className,
      )}
    >
      {[...RUNNING.map(String), final].map((v, i) => (
        <span
          key={v}
          className={cx(
            i < at && "-translate-y-[6px] opacity-0",
            i > at && "translate-y-[6px] opacity-0",
            at >= 0 && "transition duration-300 ease-soft",
          )}
        >
          {v}
        </span>
      ))}
    </MonoLabel>
  );
}

function Deck({
  step,
  reply,
  className,
}: {
  step: number;
  reply: Phase;
  className: string;
}) {
  const ready = step >= READY;
  return (
    <div
      aria-hidden="true"
      className={cx(
        "relative w-full pt-[42px] @min-[720px]:w-[min(100%,660px)] @min-[720px]:pt-[28px]",
        className,
      )}
    >
      <Ghost />
      <div className="relative z-[2] rounded-[16px] border border-line bg-card px-(--pad) pt-[18px] pb-[16px] shadow-lift [--pad:18px] @min-[720px]:[--pad:28px]">
        <div className="flex items-start justify-between gap-[16px] @max-[380px]:flex-col @max-[380px]:gap-[6px]">
          <div>
            <p className="font-serif text-[21px] text-ink leading-[1.2] tracking-[-0.015em] @min-[720px]:text-[23px]">
              <span className="text-stone">{c.card.title}</span> {c.card.lead}
            </p>
            <MonoLabel className="mt-[5px] block text-[11px] text-stone leading-[1.4] tracking-[0.03em]">
              {c.card.sub}
            </MonoLabel>
          </div>
          <MonoLabel className="grid justify-items-end whitespace-nowrap pt-[7px] text-[11px] uppercase leading-none tracking-[0.1em] *:[grid-area:1/1] @max-[380px]:justify-items-start @max-[380px]:pt-0">
            <span
              className={cx(
                "inline-flex items-center gap-[7px] text-stone",
                ready && "opacity-0 transition-opacity duration-300",
              )}
            >
              <span className="size-[6px] animate-[ro-blink_1.4s_ease-in-out_infinite] rounded-full bg-clay" />
              {c.card.preparing}
            </span>
            <span
              className={cx(
                "inline-flex items-center gap-[7px] text-olive-deep",
                fades(ready, "delay-200"),
              )}
            >
              <Icon d={CHECK} className="size-[12px]" />
              {c.card.ready}
            </span>
          </MonoLabel>
        </div>
        <div className="-mx-(--pad) mt-[14px] mb-[2px] h-[2px] bg-paper-2 @min-[720px]:mt-[18px] @min-[720px]:mb-[4px]">
          <span
            className="block h-full origin-left bg-clay"
            style={{
              transform: `scaleX(${PROGRESS[step] ?? 1})`,
              transition: step
                ? `transform ${step === PLAN ? 1600 : 900}ms var(--ease-soft)`
                : undefined,
            }}
          />
        </div>
        <div>
          {c.rows.map((row, i) => (
            <FactRow key={row.label} row={row} step={step} at={i + 1} />
          ))}
          <QuestionRow step={step} reply={reply} />
          <IntentRow step={step} />
        </div>
        <Plan on={step >= PLAN} />
        <Footer ready={ready} />
      </div>
    </div>
  );
}

// The next lead's brief, waiting behind this one.
function Ghost() {
  return (
    <div className="absolute inset-x-0 top-[8px] z-0 h-[220px] origin-top animate-[brief-drift_16s_ease-in-out_infinite] overflow-hidden rounded-[16px] border border-line bg-card px-[18px] py-[12px] shadow-lift blur-[0.5px] [transform:rotate(-1.5deg)_scale(0.965)] @min-[720px]:-top-[22px] @min-[720px]:px-[28px] @min-[720px]:py-[14px]">
      <div className="mb-[22px] flex items-baseline justify-between gap-[12px]">
        <p className="whitespace-nowrap font-serif text-[16px] text-ink-2 leading-[1.2] tracking-[-0.01em] @min-[720px]:text-[18px]">
          <span className="text-stone">{c.ghost.title}</span> {c.ghost.lead}
        </p>
        <MonoLabel className="whitespace-nowrap text-[11px] text-stone uppercase leading-none tracking-[0.1em]">
          <span className="hidden @min-[720px]:inline">{c.ghost.next}</span>
          {c.ghost.time}
        </MonoLabel>
      </div>
      <div className="grid gap-[12px]">
        {["w-[70%]", "w-[52%]", "w-[61%]"].map((w) => (
          <span key={w} className={cx("h-[8px] rounded-[4px] bg-paper-2", w)} />
        ))}
      </div>
    </div>
  );
}

// One brief row: label, the value cell (layers stacked in one grid cell, so the row
// keeps its tallest height), the source chip — and the clay bar while it is written.
// From 1040px the three sit side by side; narrower, the value drops under the label.
function Row({
  label,
  source,
  active,
  className,
  overlay,
  children,
}: {
  label: string;
  source: ReactNode;
  active: boolean;
  className?: string | false;
  overlay?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "relative -mx-(--pad) grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-[10px] gap-y-[4px] px-(--pad) py-[11px] @min-[380px]:gap-x-[16px] @min-[720px]:py-[9px] @min-[1040px]:grid-cols-[112px_minmax(0,1fr)_auto] @min-[1040px]:gap-y-0",
        "not-first:before:absolute not-first:before:inset-x-(--pad) not-first:before:top-0 not-first:before:h-px not-first:before:bg-line",
        className,
      )}
    >
      <span
        className={cx(
          "absolute top-[12px] bottom-[12px] left-0 w-[2px] rounded-r-[2px] bg-clay",
          active
            ? "transition duration-[600ms] ease-soft"
            : "scale-y-[0.3] opacity-0",
        )}
      />
      <span className="col-start-1 row-start-1 whitespace-nowrap text-[13px] text-stone leading-[1.5]">
        {label}
      </span>
      <div className="col-span-2 row-start-2 grid min-w-0 *:[grid-area:1/1] @min-[1040px]:col-span-1 @min-[1040px]:col-start-2 @min-[1040px]:row-start-1">
        {children}
      </div>
      <span className="col-start-2 row-start-1 mt-[1px] grid justify-items-end *:[grid-area:1/1] @min-[1040px]:col-start-3">
        {source}
      </span>
      {overlay}
    </div>
  );
}

function Skeleton({
  gone,
  className,
}: {
  gone: boolean;
  className?: string | false;
}) {
  return (
    <span
      className={cx(
        "grid content-start gap-[8px] pt-[6px]",
        gone && "opacity-0 transition-opacity duration-300",
        className,
      )}
    >
      <span className="h-[8px] w-[64%] rounded-[4px] bg-paper-2" />
      <span className="h-[8px] w-[40%] rounded-[4px] bg-paper-2" />
    </span>
  );
}

function FactRow({
  row,
  step,
  at,
}: {
  row: BriefRow;
  step: number;
  at: number;
}) {
  const on = step >= at;
  return (
    <Row
      label={row.label}
      active={step === at}
      className={on && FLASH}
      source={
        <MonoLabel
          className={cx(
            CHIP,
            "border-line text-stone",
            fades(on, "delay-[450ms]"),
          )}
        >
          {row.source}
        </MonoLabel>
      }
    >
      <Skeleton gone={on} />
      <span
        className={cx(
          "grid content-start justify-items-start gap-[2px]",
          writes(on),
        )}
      >
        <span className={VALUE}>{row.value}</span>
        <span
          className={
            row.quote
              ? "font-serif text-[13.5px] text-ink-2 italic leading-[1.45]"
              : NOTE
          }
        >
          {row.note}
        </span>
      </span>
    </Row>
  );
}

// The open question: asked, highlighted while Priya's reply is up, then answered.
function QuestionRow({ step, reply }: { step: number; reply: Phase }) {
  const q = c.question;
  const asked = step >= ASK;
  const saved = step >= SAVED;
  return (
    <Row
      label={q.label}
      active={asked && step < SIGNALS}
      className={
        saved
          ? cx(FLASH, FLASH_OK)
          : step === REPLY
            ? "bg-clay/10 transition-colors duration-[400ms]"
            : asked && FLASH
      }
      source={
        <>
          <MonoLabel
            className={cx(
              CHIP,
              "border-mute border-dashed text-stone",
              asked && !saved
                ? "transition-opacity delay-[450ms] duration-500"
                : "opacity-0",
            )}
          >
            {q.unknown}
          </MonoLabel>
          <MonoLabel
            className={cx(
              CHIP,
              "border-olive/40 text-olive-deep",
              fades(saved, "delay-[400ms]"),
            )}
          >
            {q.source}
          </MonoLabel>
        </>
      }
      overlay={
        <PriyaMessage
          phase={reply}
          className="top-[calc(100%-4px)] right-[12px] hidden w-[min(420px,calc(100%-24px))] rotate-[-0.6deg] @min-[1100px]:-right-[52px] @min-[720px]:block"
        />
      }
    >
      <Skeleton gone={asked} />
      <span
        className={cx(
          "grid content-start justify-items-start",
          saved
            ? "-translate-y-[4px] opacity-0 blur-[2px] transition duration-[400ms]"
            : writes(asked),
        )}
      >
        <span className={VALUE}>{q.ask}</span>
        <MonoLabel className="mt-[6px] inline-flex items-center gap-[7px] rounded-full bg-clay/10 py-[5px] pr-[10px] pl-[8px] text-[11px] text-clay-deep leading-none">
          <span className="size-[6px] animate-[ro-blink_1.4s_ease-in-out_infinite] rounded-full bg-clay" />
          {q.asking}
        </MonoLabel>
      </span>
      <span
        className={cx(
          "grid content-start justify-items-start gap-[2px]",
          writes(saved, "delay-[250ms]"),
        )}
      >
        <span className={cx(VALUE, "inline-flex items-center gap-[7px]")}>
          <Icon d={CHECK} className="size-[15px] shrink-0 text-olive-deep" />
          {q.answer}
        </span>
        <span className={NOTE}>{q.detail}</span>
        <MonoLabel
          className={cx(
            "mt-[6px] inline-flex items-center gap-[6px] rounded-full bg-olive/15 py-[5px] pr-[10px] pl-[8px] text-[11px] text-olive-deep leading-none",
            fades(saved, "delay-[800ms]"),
          )}
        >
          <Icon d={SAVE} className="size-[11px]" />
          {q.saved}
        </MonoLabel>
      </span>
    </Row>
  );
}

// From 720px the rail adds the signals up and this row lands with the result at
// SCORE. Narrower there is no rail, so the row lands as the signals start and adds
// them up itself — the same lines, bar and running total, compact — then "High".
function IntentRow({ step }: { step: number }) {
  const lands = step >= SIGNALS; // narrow containers
  const on = step >= SCORE; // from 720px, and the verdict everywhere
  return (
    <Row
      label={c.intent.label}
      active={lands && step <= SCORE}
      className={cx(lands && FLASH_NARROW, on && FLASH_WIDE)}
      source={
        <MonoLabel
          className={cx(
            CHIP,
            "border-line text-stone",
            fades(on, "delay-[450ms]"),
          )}
        >
          {c.intent.source}
        </MonoLabel>
      }
    >
      <Skeleton
        gone={on}
        className={
          lands && "transition-opacity duration-300 @max-[720px]:opacity-0"
        }
      />
      <span
        className={cx(
          "brief-intent grid max-w-[440px] content-start items-center gap-x-[10px] gap-y-[2px]",
          writes(lands),
          lands &&
            !on &&
            "@min-[720px]:translate-y-[5px] @min-[720px]:opacity-0 @min-[720px]:blur-[3px]",
        )}
      >
        <Signals
          step={step}
          className="pt-[2px] pb-[8px] [grid-area:sig] @min-[720px]:hidden"
        />
        <span className="grid items-center *:[grid-area:1/1] [grid-area:level]">
          <span
            className={cx(
              "h-[7px] rounded-[4px] bg-paper-2",
              on && "opacity-0 transition-opacity duration-300",
            )}
          />
          <span className={cx(VALUE, fades(on))}>{c.intent.level}</span>
        </span>
        <Bar step={step} className="[grid-area:bar]" />
        <Total
          step={step}
          final={c.intent.score}
          className="text-[12px] text-ink-2 [grid-area:run]"
        />
        <span className={cx(NOTE, "[grid-area:note]", fades(on))}>
          {c.intent.note}
        </span>
      </span>
    </Row>
  );
}

// Priya's WhatsApp reply, quoting the question it answers. Rendered twice: hanging
// under the open-question row from 720px, and from the sticky caption bar on phones.
const POP: Record<Phase, string> = {
  before: "translate-y-[18px] scale-[0.94] opacity-0",
  shown: "animate-[brief-pop_600ms_var(--ease-soft)_both]",
  gone: "-translate-y-[10px] scale-[0.96] opacity-0 transition duration-[450ms] ease-soft",
};

function PriyaMessage({
  phase,
  className,
}: {
  phase: Phase;
  className: string;
}) {
  const p = c.priya;
  return (
    <div
      aria-hidden="true"
      className={cx(
        "brief-float pointer-events-none absolute z-[6] rounded-[20px] border border-line bg-card p-[10px] @min-[720px]:p-[12px]",
        POP[phase],
        className,
      )}
    >
      <div className="flex items-center gap-[10px] px-[4px] pt-[2px] pb-[10px]">
        <span className="grid size-[36px] shrink-0 place-items-center rounded-full bg-cactus font-serif text-[14px] text-ink">
          {p.initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-[15px] text-ink leading-[1.25]">
            {p.name}
          </span>
          <MonoLabel className="block truncate text-[11px] text-stone leading-[1.4]">
            {p.role}
          </MonoLabel>
        </span>
        <MonoLabel className="self-start pt-[3px] text-[11px] text-stone">
          {p.time}
        </MonoLabel>
      </div>
      <div className="rounded-[16px] rounded-tl-[6px] bg-paper-2 px-[12px] pt-[10px] pb-[12px] @min-[720px]:px-[14px]">
        <div className="rounded-[8px] border-clay border-l-[3px] bg-card/80 px-[10px] py-[6px]">
          <MonoLabel className="block text-[11px] text-clay-deep leading-[1.4]">
            {p.you}
          </MonoLabel>
          <span className="block text-pretty text-[13px] text-stone leading-[1.4]">
            {p.ask}
          </span>
        </div>
        <p className="mt-[8px] text-pretty text-[18px] text-ink leading-[1.4] @min-[720px]:text-[20px]">
          {p.reply}
        </p>
      </div>
    </div>
  );
}

// Her reply, kept small once it is saved, so the finished brief still shows it:
// under her rail source from 720px, under the caption bar on phones (`named`, as
// there is no rail to say who). A placeholder bubble holds its place until then.
function Docked({
  on,
  named,
  className,
}: {
  on: boolean;
  named?: boolean;
  className: string;
}) {
  const p = c.priya;
  const BUBBLE = "rounded-[14px] rounded-tl-[4px] px-[12px] pt-[9px] pb-[8px]";
  return (
    <div aria-hidden="true" className={cx("grid *:[grid-area:1/1]", className)}>
      <span
        className={cx(
          BUBBLE,
          "grid content-center gap-[9px] border border-line border-dashed",
          on && "opacity-0 transition-opacity duration-300",
        )}
      >
        {["w-[36%]", "w-[82%]", "w-[60%]"].map((w) => (
          <span key={w} className={cx("h-[7px] rounded-[4px] bg-paper-2", w)} />
        ))}
      </span>
      <div className={cx(BUBBLE, "bg-paper-2", writes(on, "delay-[250ms]"))}>
        {named && (
          <div className="mb-[6px] flex items-center gap-[8px]">
            <span className="grid size-[24px] shrink-0 place-items-center rounded-full bg-cactus font-serif text-[11px] text-ink">
              {p.initials}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold text-[13px] text-ink leading-[1.3]">
              {p.name}
            </span>
          </div>
        )}
        {/* the time sits in the last line's corner, as WhatsApp does: the spacer
            keeps room for it, or wraps to a line of its own when there is none */}
        <p className="relative text-pretty text-[13px] text-ink leading-[19px]">
          {p.reply}
          <span className="inline-block w-[60px]" />
          <MonoLabel className="absolute right-0 bottom-0 text-[11px] text-stone leading-[19px]">
            {p.time}
          </MonoLabel>
        </p>
      </div>
    </div>
  );
}

function Plan({ on }: { on: boolean }) {
  return (
    <div className="-mx-(--pad) mt-[6px] border-line border-t bg-paper-2/45 px-(--pad) pt-[13px] pb-[14px]">
      <div className="mb-[10px] flex justify-between gap-[12px]">
        <MonoLabel className={KICK}>{c.plan.title}</MonoLabel>
        <MonoLabel className={KICK}>{c.plan.meta}</MonoLabel>
      </div>
      <ol className="grid gap-[7px] @min-[720px]:grid-flow-col @min-[720px]:grid-cols-2 @min-[720px]:grid-rows-3 @min-[720px]:gap-x-[28px]">
        {c.plan.steps.map((s, i) => {
          const d = { transitionDelay: `${i * 260}ms` };
          return (
            <li
              key={s.text}
              className="relative grid grid-cols-[26px_minmax(0,1fr)] items-baseline"
            >
              <MonoLabel
                className={cx(
                  "text-[11px] text-stone leading-[1.5]",
                  on ? "transition-opacity duration-[400ms]" : "opacity-0",
                )}
                style={d}
              >
                {String(i + 1).padStart(2, "0")}
              </MonoLabel>
              <span
                className={cx(
                  "text-[13.5px] text-ink-2 leading-[1.45]",
                  on
                    ? "transition-[clip-path] duration-[900ms] ease-soft [clip-path:inset(0)]"
                    : "[clip-path:inset(0_100%_0_0)]",
                )}
                style={{ transitionDelay: `${i * 260 + 140}ms` }}
              >
                {s.text}
                {s.via && (
                  <MonoLabel className="ml-[6px] whitespace-nowrap text-[11px] text-clay-deep">
                    {s.via}
                  </MonoLabel>
                )}
              </span>
              <span
                className={cx(
                  "absolute top-1/2 left-[26px] -mt-[4px] h-[8px] w-[62%] rounded-[4px] bg-paper-2",
                  on && "opacity-0 transition-opacity duration-200",
                )}
                style={d}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Footer({ ready }: { ready: boolean }) {
  return (
    <div className="-mx-(--pad) flex min-h-[42px] flex-wrap items-center justify-between gap-[12px] border-line border-t px-(--pad) pt-[14px] @min-[720px]:pt-[12px]">
      <div className="grid items-center *:[grid-area:1/1]">
        <MonoLabel
          className={cx(
            "text-[11px] text-stone leading-[1.4]",
            ready && "opacity-0 transition-opacity duration-[250ms]",
          )}
        >
          {c.footer.waiting}
        </MonoLabel>
        <MonoLabel
          className={cx(
            "inline-flex rotate-[-1.5deg] items-center gap-[8px] justify-self-start rounded-[6px] border-[1.5px] border-clay-deep/85 bg-clay/5 px-[11px] pt-[8px] pb-[7px] text-[11.5px] text-clay-deep uppercase leading-none tracking-[0.1em]",
            ready
              ? "transition delay-100 duration-[600ms] ease-soft"
              : "scale-[1.3] opacity-0",
          )}
        >
          <Icon d={CHECK} className="size-[13px]" />
          {c.footer.stamp}
        </MonoLabel>
      </div>
      <MonoLabel
        className={cx(
          "inline-flex min-h-[30px] items-center gap-[9px] whitespace-nowrap rounded-full border border-line bg-paper pr-[12px] pl-[11px] text-[11.5px] text-ink-2 leading-[14px] @max-[380px]:whitespace-normal @max-[380px]:py-[6px]",
          ready
            ? "transition delay-[900ms] duration-700 ease-soft"
            : "translate-x-[10px] opacity-0",
        )}
      >
        <span className="inline-flex h-[12px] items-center gap-[2px]">
          {WAVE.map((h, k) => (
            <span
              key={h}
              className={cx(
                "h-[12px] w-[2px] rounded-[1px] bg-clay",
                ready && "animate-[ro-wave_1.1s_ease-in-out_infinite]",
              )}
              style={{
                transform: `scaleY(${h})`,
                animationDelay: `${k * -180}ms`,
              }}
            />
          ))}
        </span>
        <span className="inline-flex tabular-nums">
          {c.footer.calling}
          <span className="inline-block h-[14px] overflow-hidden">
            <span
              className={cx(
                "block [transform:translateY(-112px)]",
                ready &&
                  "motion-safe:animate-[brief-count_9s_steps(9,jump-none)_1.2s_both]",
              )}
            >
              {DIGITS.map((d) => (
                <span key={d} className="block h-[14px]">
                  {d}
                </span>
              ))}
            </span>
          </span>
        </span>
      </MonoLabel>
    </div>
  );
}
