import { useEffect, useRef, useState } from "react";
import { type CallScenario, callLabels, calls } from "../content/hero";
import { MonoLabel } from "../design/MonoLabel";
import { cx } from "../lib/cx";
import { useStill } from "../lib/motion";
import { CHECK, Icon, RECALL } from "./Icon";

// The hero's show-don't-tell demo: an AI agent rings a freshly imported enquiry,
// talks Hinglish, captures the qualifying fields, gauges readiness and routes the
// lead — alternating a booked site visit (ready) with follow-ups (not yet). One
// integer `tick` (250ms beats) drives it all: each call's beats are planned once
// below and every row is derived from them. Both calls stay stacked in one grid
// cell, so the card keeps the taller one's height and never shifts; pending
// fields are hairline outlines, space held for what the call will capture. SSR,
// reduced motion and browsers without IntersectionObserver get the first call's
// finished frame; the loop runs only while the card is in view, the tab is
// visible and the page-wide pause switch is off. The card speaks as one labelled
// image, so each call's own markup is hidden from assistive tech. On phones the
// "Called … after import" chip takes its own row under the source line.

const TICK = 250;
const LEAD_IN = 1; // first play only: the ring holds while the card rises in
const RING = 4; // beats of ringing before the lead picks up
const TYPING = 3; // beats of "…" before each agent line
const FILL_MS = 900; // the intent meter's fill; the outcome lands as it does
const HOLD = 14; // beats the outcome rests before the fade
const FADE = 2;
// The call plays once 40% of the card is on screen — or, when the card outgrows
// the viewport (high zoom), once it fills 60% of it; the fine thresholds let the
// observer notice either.
const IN_VIEW = 0.4;
const FILLS_VIEW = 0.6;
const THRESHOLDS = Array.from({ length: 9 }, (_, i) => (i * IN_VIEW) / 8);
const mmss = (s: number) =>
  [s / 60, s % 60].map((n) => String(Math.floor(n)).padStart(2, "0")).join(":");

function plan(call: CallScenario, start: number) {
  const connect = start + RING;
  let t = connect + 1;
  const lines = call.lines.map((line) => {
    if (line.who === "agent") t += TYPING;
    const at = t;
    t += Math.round((600 + line.text.length * 11) / TICK); // time to read it
    return { ...line, at };
  });
  const hangup = t;
  const captured = call.captured.map((label, i) => ({ label, at: t + 1 + i }));
  const summary = t + captured.length + 2;
  const meter = summary + 2;
  const outcome = meter + Math.ceil(FILL_MS / TICK);
  const fade = outcome + HOLD;
  return {
    call,
    start,
    connect,
    lines,
    hangup,
    captured,
    summary,
    meter,
    outcome,
    fade,
    end: fade + FADE,
  };
}

type Plan = ReturnType<typeof plan>;
const PLANS: Plan[] = []; // the calls play back to back
for (const c of calls) PLANS.push(plan(c, PLANS.at(-1)?.end ?? 0));
const CYCLE = PLANS.at(-1)?.end ?? 1;
const STILL = PLANS[0]?.outcome ?? 0; // the first call, finished

const TONES = {
  high: {
    avatar: "bg-oat",
    fill: "bg-clay",
    text: "text-clay-deep",
    icon: CHECK,
  },
  low: {
    avatar: "bg-cactus",
    fill: "bg-olive",
    text: "text-olive-deep",
    icon: RECALL,
  },
} as const;

const CAPS = "text-[11px] uppercase tracking-[0.1em]";
const RISE = "animate-[ro-rise_500ms_var(--ease-soft)_both]";
const FADE_IN = "animate-[ro-fade_500ms_both]";
const show = (on: boolean, anim = RISE) => (on ? anim : "opacity-0");
// A pending field is an empty hairline outline that takes its fill when its beat
// lands (the fill eases in one way only, so a reset while hidden snaps back).
const slot = (done: boolean, fill: string) =>
  done ? cx(fill, "transition-colors duration-500") : "border-line";

function Dots() {
  return [0, 1, 2].map((k) => (
    <span
      key={k}
      className="size-[5px] animate-[ro-blink_1.2s_ease-in-out_infinite] rounded-full bg-stone"
      style={{ animationDelay: `${k * 160}ms` }}
    />
  ));
}

export function HeroCall({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [motion] = useState(
    () =>
      typeof window !== "undefined" &&
      "IntersectionObserver" in window &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [tick, setTick] = useState(motion ? -LEAD_IN : STILL);
  const [live, setLive] = useState(false);
  const still = useStill();

  useEffect(() => {
    const el = ref.current;
    if (!motion || !el) return;
    let seen = false;
    const sync = () => setLive(seen && !document.hidden);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const view = e.rootBounds?.height ?? window.innerHeight;
          seen =
            e.intersectionRatio >= IN_VIEW ||
            e.intersectionRect.height >= view * FILLS_VIEW;
        }
        sync();
      },
      { threshold: THRESHOLDS },
    );
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [motion]);

  useEffect(() => {
    if (!live || still) return;
    const id = setTimeout(() => setTick((tick + 1) % CYCLE), TICK);
    return () => clearTimeout(id);
  }, [live, still, tick]);

  const now = Math.max(tick, 0); // the lead-in rests on beat 0
  return (
    <div
      ref={ref}
      role="img"
      aria-label={callLabels.aria}
      className={cx(
        "grid rounded-[24px] border border-line bg-card p-[16px] shadow-lift sm:p-[24px]",
        className,
      )}
    >
      {PLANS.map((p) => {
        const on = now >= p.start && now < p.end;
        return (
          <Call
            key={p.call.lead}
            p={p}
            t={on ? now : p.outcome}
            shown={on && now < p.fade}
          />
        );
      })}
    </div>
  );
}

function Call({ p, t, shown }: { p: Plan; t: number; shown: boolean }) {
  const { call } = p;
  const tone = TONES[call.intent];
  const state = t < p.connect ? "ringing" : t < p.hangup ? "live" : "ended";
  const filled = t >= p.meter;
  return (
    <div
      aria-hidden="true"
      className={cx(
        "flex flex-col gap-[12px] transition-opacity duration-[400ms] [grid-area:1/1] sm:gap-[16px]",
        !shown && "opacity-0",
      )}
    >
      <div className="flex items-center justify-between gap-[8px]">
        <MonoLabel className={cx(CAPS, "whitespace-nowrap text-stone")}>
          {callLabels.newLead} · {call.time}
        </MonoLabel>
        <MonoLabel className="flex h-[26px] shrink-0 items-center gap-[8px] whitespace-nowrap rounded-full border border-line bg-paper px-[10px] text-[11px] text-ink-2">
          {state === "live" ? (
            <span className="flex h-[12px] items-center gap-[2px]">
              {[0, 1, 2, 3, 4].map((k) => (
                <span
                  key={k}
                  className="h-full w-[2px] animate-[ro-wave_1.1s_ease-in-out_infinite] rounded-full bg-clay"
                  style={{ animationDelay: `${k * -180}ms` }}
                />
              ))}
            </span>
          ) : (
            <span className="relative flex size-[7px]">
              {state === "ringing" && (
                <span className="absolute inset-0 animate-[ro-ring_1.2s_var(--ease-soft)_infinite] rounded-full bg-clay" />
              )}
              <span
                className={cx(
                  "relative size-[7px] rounded-full",
                  state === "ringing" ? "bg-clay" : "bg-mute",
                )}
              />
            </span>
          )}
          {callLabels.status[state]}
          {state === "ended" && (
            <span className="text-stone">{mmss(call.seconds)}</span>
          )}
        </MonoLabel>
      </div>

      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-[12px] gap-y-[2px] border-line border-b pb-[12px] sm:pb-[16px]">
        <span
          className={cx(
            "row-span-2 grid size-[40px] place-items-center rounded-full font-serif text-[18px] text-ink max-sm:row-span-3",
            tone.avatar,
          )}
        >
          {call.lead.charAt(0)}
        </span>
        <span className="font-serif text-[18px] text-ink leading-[1.3] tracking-[-0.01em] max-sm:col-span-2">
          {call.lead}
        </span>
        <MonoLabel
          className={cx(
            "whitespace-nowrap rounded-full bg-clay/10 px-[8px] py-[3px] text-[11px] text-clay-deep max-sm:col-start-2 max-sm:row-start-3 max-sm:mt-[4px] max-sm:justify-self-start",
            show(t >= p.connect),
          )}
        >
          {callLabels.called} {call.calledAfter}
        </MonoLabel>
        <MonoLabel className="col-span-2 truncate text-[11px] text-stone">
          {call.source}
        </MonoLabel>
      </div>

      <div className="grid flex-1">
        {state === "ringing" && (
          <MonoLabel
            className={cx(
              CAPS,
              "flex animate-[ro-fade_500ms_both] items-center gap-[10px] place-self-center text-stone [grid-area:1/1]",
            )}
          >
            {callLabels.calling} {call.lead}
            <span className="flex gap-[4px]">
              <Dots />
            </span>
          </MonoLabel>
        )}
        <div className="flex flex-col gap-[6px] [grid-area:1/1] sm:gap-[8px]">
          {p.lines.map((line) => {
            const agent = line.who === "agent";
            return (
              <div
                key={line.text}
                className={cx(
                  "flex flex-col",
                  agent
                    ? "items-start pr-[16px] sm:pr-[32px]"
                    : "items-end pl-[16px] sm:pl-[32px]",
                )}
              >
                {agent && (
                  <MonoLabel
                    className={cx(
                      "mb-[5px] text-[10.5px] text-stone tracking-[0.06em]",
                      show(t >= line.at - TYPING),
                    )}
                  >
                    {callLabels.agent}
                  </MonoLabel>
                )}
                <div className="grid">
                  {agent && t >= line.at - TYPING && t < line.at && (
                    <span className="flex h-[38px] w-[58px] animate-[ro-fade_300ms_both] items-center justify-center gap-[4px] rounded-[16px] rounded-tl-[6px] bg-paper-2 [grid-area:1/1]">
                      <Dots />
                    </span>
                  )}
                  <p
                    className={cx(
                      "text-pretty rounded-[16px] px-[14px] py-[8px] text-[13.5px] leading-[1.5] [grid-area:1/1] sm:py-[9px] sm:text-[14px]",
                      agent
                        ? "rounded-tl-[6px] bg-paper-2 text-ink-2"
                        : "rounded-tr-[6px] bg-ink text-paper",
                      show(t >= line.at),
                    )}
                  >
                    {line.text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-[12px] border-line border-t pt-[12px] sm:pt-[16px]">
        <div className="flex items-center justify-between gap-[12px]">
          <MonoLabel className={cx(CAPS, "text-stone")}>
            {callLabels.captured}
          </MonoLabel>
          <MonoLabel
            className={cx("text-[11px] text-olive-deep", show(t >= p.summary))}
          >
            {callLabels.summary}
          </MonoLabel>
        </div>
        <div className="flex flex-wrap gap-[6px] sm:gap-[8px]">
          {p.captured.map((c) => (
            <MonoLabel
              key={c.label}
              className={cx(
                "rounded-full border px-[8px] py-[4px] text-[11px] text-ink-2 sm:px-[10px]",
                slot(t >= c.at, "border-line bg-paper"),
              )}
            >
              <span
                className={cx(
                  "inline-flex items-center gap-[5px]",
                  show(t >= c.at, FADE_IN),
                )}
              >
                <Icon d={CHECK} className="size-[11px] text-olive-deep" />
                {c.label}
              </span>
            </MonoLabel>
          ))}
        </div>
        <div className="flex items-center gap-[12px]">
          <MonoLabel className={cx(CAPS, "text-stone")}>
            {callLabels.readiness}
          </MonoLabel>
          <span className="h-[4px] flex-1 overflow-hidden rounded-full bg-ink/[0.08]">
            <span
              className={cx("block h-full origin-left rounded-full", tone.fill)}
              style={{
                transform: `scaleX(${filled ? call.score / 100 : 0})`,
                // eases up to the score; a reset (while hidden) snaps back
                transition: filled
                  ? `transform ${FILL_MS}ms var(--ease-soft)`
                  : undefined,
              }}
            />
          </span>
          <MonoLabel className={cx("text-[11px]", tone.text, show(filled))}>
            {call.verdict}
          </MonoLabel>
        </div>
      </div>

      <div
        className={cx(
          "rounded-[16px] border p-[12px] sm:p-[14px]",
          slot(t >= p.outcome, "border-transparent bg-paper-2"),
        )}
      >
        <div
          className={cx("flex items-center gap-[14px]", show(t >= p.outcome))}
        >
          <span
            className={cx(
              "grid size-[36px] shrink-0 place-items-center rounded-full text-paper",
              tone.fill,
            )}
          >
            <Icon d={tone.icon} className="size-[16px]" />
          </span>
          <div className="min-w-0">
            <p className="font-serif text-[18px] text-ink leading-[1.3] tracking-[-0.01em]">
              {call.outcome.title}
            </p>
            <p className="mt-[2px] text-pretty text-[12.5px] text-stone leading-[1.45]">
              {call.outcome.detail}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
