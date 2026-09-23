import { useEffect, useRef, useState } from "react";
import { type CallScenario, callLabels, calls } from "../content/hero";
import { MonoLabel } from "../design/MonoLabel";
import { cx } from "../lib/cx";

// The hero's show-don't-tell demo: an AI agent rings a fresh portal lead, talks
// Hinglish, captures the qualifying fields, scores intent and routes the lead —
// alternating a booked site visit (high intent) with a nurture loop (low). One
// integer `tick` (250ms beats) drives it all: each call's beats are planned once
// below and every row is derived from them. Both calls stay stacked in one grid
// cell, so the card keeps the taller one's height and never shifts. SSR, reduced
// motion and browsers without IntersectionObserver get the first call's finished
// frame; the loop runs only while the card is in view and the tab is visible.

const TICK = 250;
const TYPING = 3; // beats of "…" before each agent line
const HOLD = 14; // beats the outcome rests before the fade
const FADE = 2;
const IN_VIEW = 0.4; // share of the card on screen before the call plays
const LEAD_IN = 4; // first play only: the ring holds while the card rises in

function plan(call: CallScenario, start: number) {
  const connect = start + 5; // 1.25s of ringing
  let t = connect + 2;
  const lines = call.lines.map((line) => {
    if (line.who === "agent") t += TYPING;
    const at = t;
    t += Math.round((600 + line.text.length * 11) / TICK); // time to read it
    return { ...line, at };
  });
  const hangup = t;
  const captured = call.captured.map((label, i) => ({ label, at: t + 1 + i }));
  const crm = t + captured.length + 2;
  const meter = crm + 2;
  const outcome = meter + 4; // as the 900ms fill lands
  const fade = outcome + HOLD;
  return {
    call,
    start,
    connect,
    lines,
    hangup,
    captured,
    crm,
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

const CHECK = "M3.5 8.5 6.5 11.5 12.5 4.5";
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
    icon: "M12.8 9.5A5 5 0 1 1 11.5 4.3M12 1.8v2.9H9.1", // the re-call loop
  },
} as const;

const CAPS = "text-[11px] uppercase tracking-[0.1em]";
const RISE = "animate-[ro-rise_500ms_var(--ease-soft)_both]";
const FADE_IN = "animate-[ro-fade_500ms_both]";
const show = (on: boolean, anim = RISE) => (on ? anim : "opacity-0");
// A pending field is a faint ghost that takes its fill when its beat lands
// (the fade runs one way only, so a reset while hidden snaps back).
const slot = (done: boolean, fill: string) =>
  done
    ? cx(fill, "transition-colors duration-500")
    : "border-transparent bg-ink/[0.035]";
const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function HeroCall() {
  const ref = useRef<HTMLDivElement>(null);
  const [motion] = useState(
    () =>
      typeof window !== "undefined" &&
      "IntersectionObserver" in window &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [tick, setTick] = useState(motion ? -LEAD_IN : STILL);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!motion || !el) return;
    let seen = false;
    const sync = () => setLive(seen && !document.hidden);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen = e.intersectionRatio >= IN_VIEW;
        sync();
      },
      { threshold: IN_VIEW },
    );
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [motion]);

  useEffect(() => {
    if (!live) return;
    const id = setTimeout(() => setTick((tick + 1) % CYCLE), TICK);
    return () => clearTimeout(id);
  }, [live, tick]);

  const now = Math.max(tick, 0); // the lead-in rests on beat 0
  return (
    <div
      ref={ref}
      role="img"
      aria-label={callLabels.aria}
      className="grid rounded-[24px] border border-line bg-white/70 p-[16px] shadow-[0_1px_2px_rgba(20,20,19,0.04),0_12px_32px_-12px_rgba(20,20,19,0.12)] sm:p-[24px]"
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
      className={cx(
        "flex flex-col gap-[16px] transition-opacity duration-[400ms] [grid-area:1/1]",
        !shown && "opacity-0",
      )}
    >
      <div className="flex items-center justify-between gap-[8px]">
        <MonoLabel className={cx(CAPS, "text-stone")}>
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
          {state !== "ringing" && (
            <span className="text-stone">
              {mmss(Math.min(t, p.hangup) - p.connect)}
            </span>
          )}
        </MonoLabel>
      </div>

      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-[12px] gap-y-[2px] border-line border-b pb-[16px]">
        <span
          className={cx(
            "row-span-2 grid size-[40px] place-items-center rounded-full font-serif text-[18px] text-ink",
            tone.avatar,
          )}
        >
          {call.lead.charAt(0)}
        </span>
        <span className="font-serif text-[18px] text-ink leading-[1.3] tracking-[-0.01em]">
          {call.lead}
        </span>
        <MonoLabel
          className={cx(
            "rounded-full bg-clay/10 px-[8px] py-[3px] text-[11px] text-clay-deep",
            show(t >= p.connect),
          )}
        >
          {callLabels.calledIn} {call.calledIn}
        </MonoLabel>
        <MonoLabel className="col-span-2 text-[11px] text-stone">
          {call.source}
        </MonoLabel>
      </div>

      <div className="flex flex-1 flex-col gap-[8px]">
        {p.lines.map((line) => {
          const agent = line.who === "agent";
          return (
            <div
              key={line.text}
              className={cx(
                "flex flex-col",
                agent
                  ? "items-start pr-[20px] sm:pr-[32px]"
                  : "items-end pl-[20px] sm:pl-[32px]",
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
                    {[0, 1, 2].map((k) => (
                      <span
                        key={k}
                        className="size-[5px] animate-[ro-blink_1.2s_ease-in-out_infinite] rounded-full bg-stone"
                        style={{ animationDelay: `${k * 160}ms` }}
                      />
                    ))}
                  </span>
                )}
                <p
                  className={cx(
                    "m-0 rounded-[16px] px-[14px] py-[9px] text-[14px] leading-[1.5] [grid-area:1/1]",
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

      <div className="flex flex-col gap-[12px] border-line border-t pt-[16px]">
        <div className="flex items-center justify-between gap-[12px]">
          <MonoLabel className={cx(CAPS, "text-stone")}>
            {callLabels.captured}
          </MonoLabel>
          <MonoLabel
            className={cx("text-[11px] text-olive-deep", show(t >= p.crm))}
          >
            {callLabels.crm}
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
            {callLabels.intent}
          </MonoLabel>
          <span className="h-[4px] flex-1 overflow-hidden rounded-full bg-ink/[0.08]">
            <span
              className={cx(
                "block h-full origin-left rounded-full",
                tone.fill,
                filled &&
                  "transition-transform duration-[900ms] ease-[var(--ease-soft)]",
              )}
              style={{ transform: `scaleX(${filled ? call.score / 100 : 0})` }}
            />
          </span>
          <MonoLabel className={cx("text-[11px]", tone.text, show(filled))}>
            {call.score}/100 · {call.verdict}
          </MonoLabel>
        </div>
      </div>

      <div
        className={cx(
          "rounded-[16px] border p-[14px]",
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
            <p className="m-0 font-serif text-[18px] text-ink leading-[1.3] tracking-[-0.01em]">
              {call.outcome.title}
            </p>
            <p className="m-0 mt-[2px] text-[12.5px] text-stone leading-[1.45]">
              {call.outcome.detail}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Icon({ d, className }: { d: string; className: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d={d}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
