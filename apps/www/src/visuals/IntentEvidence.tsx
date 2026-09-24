import { type CSSProperties, Fragment, type ReactNode, useRef } from "react";
import { intentScore, intentSignals } from "../content/beforeCall";
import { intentEvidence as copy } from "../content/intentEvidence";
import { MonoLabel } from "../design/MonoLabel";
import { cx } from "../lib/cx";
import { useSequence } from "../lib/sequence";
import { Icon, RECALL } from "./Icon";

// "Why he's a high-intent buyer": the intent step of the story, zoomed in. A ledger
// of evidence (left) beside its waterfall on one 0–100 scale (right): each signal
// lands with its weight and extends the climb, the meter fills and crosses the
// call-now line, the home loan lands as context with no weight, the total rolls up
// to 78, and the router lights "Call now" while the follow-up plan stays dim. The
// numbers are beforeCall.ts's, never restated. useSequence steps it (reduced motion,
// the Pause switch and the server render show the final frame); a beat eases only on
// its way in, so the reset snaps back while the stage is faded. Below lg it stacks —
// each card over its own track — and every beat only fades, so the height never
// jumps. One labelled image: the summary tells the story once.
const { total, outOf, callNow } = intentScore;
const N = intentSignals.length;
const pct = (v: number) => `${(v / outOf) * 100}%`;
const beforeTotal = (d: string) => `calc(${pct(total)} - ${d})`; // x, left of the endpoint

// Each signal's span on the scale starts where the one before it ended.
const ROWS = intentSignals.map((s, i) => {
  const a = intentSignals.slice(0, i).reduce((sum, p) => sum + p.weight, 0);
  return { ...s, a, b: a + s.weight };
});

// Beats: 0 the open, 1…N the signals, then the home loan, the total, the route.
const CONTEXT = N + 1;
const TOTAL = N + 2;
const ROUTE = N + 3;
const CROSS = ROWS.findIndex((r) => r.b >= callNow) + 1; // the beat past the line
const LANDED = 900 + N * 1650; // the home loan lands
const STARTS = [
  0,
  ...Array.from({ length: N + 1 }, (_, i) => 900 + i * 1650),
  LANDED + 1800,
  LANDED + 3400,
];
const HOLD = 4600;
const TICKS = [0, 0.25, 0.5, 0.75, 1]
  .map((f) => f * outOf)
  .filter((v) => v !== callNow);

const { captions } = copy;
const CAPTIONS = [
  captions.open,
  ...captions.signals.map((c, i) =>
    i + 1 === CROSS ? `${c} ${captions.crossed}` : c,
  ),
  captions.context,
  captions.total,
  captions.route,
];

// A handset, for the "Call now" route (the follow-up plan borrows RECALL).
const PHONE =
  "M5.6 2.8 4 3.2c-.6.2-1 .8-.9 1.4.5 4 3.8 7.3 7.8 7.8.6.1 1.2-.3 1.4-.9l.4-1.6c.1-.4-.1-.8-.5-1L10.3 8c-.4-.2-.8-.1-1 .2l-.6.8C7.4 8.4 6.8 7.6 6.2 6.6l.8-.6c.3-.3.4-.7.2-1L6.6 3.3c-.2-.4-.6-.6-1-.5z";
const WAVE = [0.45, 0.9, 0.6, 1];
const KICK = "text-[11px] uppercase tracking-[0.12em]";
const STEM = "absolute w-[2px] rounded-[1px]";

// An element eases into its beat (`on`); before it, it rests at `off`, untransitioned.
const ease = (
  on: boolean,
  off: CSSProperties,
  ms = 700,
  delay = 0,
): CSSProperties =>
  on ? { transition: `all ${ms}ms var(--ease-soft) ${delay}ms` } : off;

// Hyphenated words ("re-call", "call-now") wrap whole, never at the hyphen.
const keep = (text: string) =>
  text.split(/(\S+-\S+)/).map((part, i) =>
    i % 2 ? (
      <span key={part} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );

export function IntentEvidence() {
  const ref = useRef<HTMLDivElement>(null);
  const { step, resetting, settled } = useSequence(ref, STARTS, HOLD);
  const at = (n: number) => step >= n;
  const crossed = at(CROSS);
  const routed = at(ROUTE);

  return (
    <div
      ref={ref}
      data-settled={settled || undefined}
      role="img"
      aria-label={copy.summary}
      className={cx(
        "relative isolate overflow-hidden rounded-[24px] border border-line bg-paper transition-opacity duration-[450ms] ease-soft",
        resetting && "opacity-15",
      )}
    >
      <div
        aria-hidden="true"
        className="grid gap-[22px] px-[16px] pt-[24px] pb-[28px] md:px-[32px] md:pt-[28px] md:pb-[32px] lg:gap-[24px] lg:pt-[24px] lg:pb-[24px] lg:px-[40px] xl:px-[48px]"
      >
        <span
          className="-z-1 pointer-events-none absolute right-[4%] bottom-0 h-[46%] w-[46%] bg-[radial-gradient(50%_55%_at_60%_60%,color-mix(in_oklab,var(--color-clay)_14%,transparent),transparent_75%)] max-lg:hidden"
          style={ease(routed, { opacity: 0 }, 1600, 800)}
        />

        <div className="grid gap-[10px]">
          <ol className="flex flex-wrap items-center gap-x-[14px] gap-y-[4px] font-mono text-[11px] text-stone uppercase leading-[1.4] tracking-[0.1em] lg:gap-x-0">
            {copy.story.steps.map((s, i) => {
              const here = i === copy.story.at;
              return (
                <li
                  key={s}
                  className={cx(
                    "inline-flex items-center whitespace-nowrap",
                    here && "text-ink",
                  )}
                >
                  {i > 0 && (
                    <span className="mx-[9px] h-px w-[14px] bg-mute max-lg:hidden" />
                  )}
                  {here && (
                    <span className="mr-[7px] size-[6px] rounded-full bg-clay" />
                  )}
                  {s}
                  {here && ` · ${copy.story.time}`}
                </li>
              );
            })}
          </ol>
          <p className="grid font-serif text-[18px] text-ink leading-[1.4] tracking-[-0.005em] lg:text-[20px]">
            {CAPTIONS.map((c, i) => (
              <span
                key={c}
                className={cx(
                  "max-w-[50ch] text-pretty [grid-area:1/1]",
                  i !== step &&
                    "translate-y-[6px] opacity-0 transition-opacity duration-200",
                )}
                style={ease(i === step, {}, 700, 240)}
              >
                <span className="mr-[4px] align-[-0.12em] text-[1.3em] text-clay leading-[0]">
                  {copy.quote}
                </span>
                {keep(c)}
              </span>
            ))}
          </p>
        </div>

        <div
          className="relative grid [--gap:36px] [--lg:332px] [--row:50px] lg:grid-cols-[var(--lg)_minmax(0,1fr)] lg:grid-rows-[34px_repeat(var(--rows),var(--row))_76px_auto] lg:gap-x-(--gap) xl:[--gap:44px]"
          style={{ "--rows": N + 1 } as CSSProperties}
        >
          <MonoLabel
            className={cx(
              KICK,
              "hidden justify-between self-end px-[14px] pb-[8px] text-stone lg:col-start-1 lg:flex",
            )}
          >
            <span>{copy.evidence}</span>
            <span>{copy.weight}</span>
          </MonoLabel>
          <MonoLabel className="relative block h-[26px] self-end text-[11px] text-stone tabular-nums leading-none lg:col-start-2 lg:h-0">
            {TICKS.map((v) => (
              <span
                key={v}
                className={cx(
                  "absolute bottom-[8px]",
                  v === outOf
                    ? "-translate-x-full"
                    : v > 0 && "-translate-x-1/2",
                )}
                style={{ left: pct(v) }}
              >
                {v}
              </span>
            ))}
            <span
              className={cx(
                "-translate-x-1/2 absolute bottom-[8px] whitespace-nowrap",
                crossed ? "text-clay-deep" : "text-ink-2",
              )}
              style={{ left: pct(callNow), ...ease(crossed, {}, 600, 1050) }}
            >
              {callNow}
              <span className="text-stone max-lg:hidden">
                {" "}
                · {copy.callNowLine}
              </span>
            </span>
          </MonoLabel>
          <div className="pointer-events-none absolute top-[34px] right-0 left-[calc(var(--lg)+var(--gap))] h-[calc(var(--rows)*var(--row)+76px)] max-lg:hidden">
            {TICKS.map((v) => (
              <span
                key={v}
                className="absolute inset-y-0 w-px bg-line"
                style={{ left: v === outOf ? "calc(100% - 1px)" : pct(v) }}
              />
            ))}
            <span
              className={cx(
                "absolute inset-y-0 w-px",
                crossed ? "bg-clay-deep" : "bg-ink/30",
              )}
              style={{ left: pct(callNow), ...ease(crossed, {}, 600, 1050) }}
            />
          </div>

          {ROWS.map((r, i) => (
            <Fragment key={r.label}>
              <Card
                on={at(i + 1)}
                label={r.label}
                detail={r.detail}
                weight={`+${r.weight}`}
              />
              <Track crossed={crossed}>
                <span
                  className="absolute top-[calc(50%-5px)] h-[10px] origin-left rounded-[3px] bg-clay"
                  style={{
                    left: pct(r.a),
                    width: pct(r.weight),
                    ...ease(at(i + 1), { transform: "scaleX(0)" }, 900, 350),
                  }}
                >
                  {i < N - 1 && (
                    <span
                      className="absolute top-full left-[calc(100%-1px)] h-[calc(var(--row)-10px)] w-px origin-top bg-stone/55 max-lg:hidden"
                      style={ease(
                        at(i + 2),
                        { transform: "scaleY(0)" },
                        500,
                        150,
                      )}
                    />
                  )}
                </span>
              </Track>
            </Fragment>
          ))}
          <Card
            ctx
            on={at(CONTEXT)}
            label={copy.context.label}
            detail={copy.context.detail}
          />
          <Track crossed={crossed}>
            <span
              className="absolute top-[calc(50%-6px)] size-[12px] rounded-full border-[1.5px] border-stone bg-paper"
              style={{
                left: beforeTotal("6px"),
                ...ease(
                  at(CONTEXT),
                  { opacity: 0, transform: "scale(0.4)" },
                  600,
                  500,
                ),
              }}
            />
            <MonoLabel
              className="-translate-y-1/2 absolute top-1/2 whitespace-nowrap bg-paper px-[4px] text-[11px] text-stone leading-[1.3]"
              style={{
                right: `calc(${pct(outOf - total)} + 10px)`,
                ...ease(at(CONTEXT), { opacity: 0 }, 600, 800),
              }}
            >
              {copy.context.note}
            </MonoLabel>
          </Track>

          <div className="mt-[18px] flex items-center justify-between gap-[12px] border-ink border-t px-[2px] pt-[12px] lg:col-start-1 lg:mt-[8px] lg:px-[14px]">
            <div className="grid gap-[6px]">
              <MonoLabel className={cx(KICK, "text-stone")}>
                {copy.intent}
              </MonoLabel>
              <MonoLabel
                className="inline-flex items-center gap-[6px] justify-self-start rounded-full bg-[color-mix(in_oklab,var(--color-clay)_12%,var(--color-card))] py-[4px] pr-[9px] pl-[8px] text-[11px] text-clay-deep uppercase leading-none tracking-[0.1em]"
                style={ease(
                  at(TOTAL),
                  { opacity: 0, transform: "translateY(4px)" },
                  600,
                  200,
                )}
              >
                <span className="size-[6px] rounded-full bg-clay" />
                {copy.high}
              </MonoLabel>
            </div>
            <div className="flex items-baseline gap-[6px]">
              <span className="-my-[6px] inline-block h-[56px] overflow-hidden font-medium text-[44px] text-ink tabular-nums leading-[56px] tracking-[-0.03em] [mask-image:linear-gradient(transparent,black_18%,black_82%,transparent)]">
                <span
                  className="block"
                  style={{
                    transform: `translateY(${-56 * Math.min(step, N)}px)`,
                    ...ease(step > 0, {}, 800, 550),
                  }}
                >
                  {[0, ...ROWS.map((r) => r.b)].map((v) => (
                    <span key={v} className="block h-[56px] text-right">
                      {v}
                    </span>
                  ))}
                </span>
              </span>
              <MonoLabel className="text-[13px] text-stone">
                {copy.outOf}
              </MonoLabel>
            </div>
          </div>
          <div className="relative z-1 mt-[4px] h-[48px] lg:col-start-2 lg:mt-[8px] lg:h-auto">
            <div className="absolute inset-x-0 top-[calc(50%-7px)] h-[14px] rounded-[4px] bg-[color-mix(in_oklab,var(--color-clay)_11%,var(--color-paper-2))]">
              {ROWS.map((r, i) => (
                <span
                  key={r.label}
                  className="absolute inset-y-0 origin-left bg-clay first:rounded-l-[4px] last:rounded-r-[4px]"
                  style={{
                    left: pct(r.a),
                    width:
                      i < N - 1
                        ? `calc(${pct(r.weight)} - 2px)`
                        : pct(r.weight),
                    ...ease(at(i + 1), { transform: "scaleX(0)" }, 800, 600),
                  }}
                />
              ))}
            </div>
            <MonoLabel
              className="-translate-x-1/2 absolute bottom-[calc(50%+14px)] text-[11px] text-ink tabular-nums leading-none max-lg:hidden"
              style={{ left: pct(total), ...ease(at(TOTAL), { opacity: 0 }) }}
            >
              {total}
            </MonoLabel>
            <span
              className="absolute top-[calc(50%-8px)] size-[16px] rounded-full bg-ink shadow-[0_0_0_3px_var(--color-paper)]"
              style={{
                left: beforeTotal("8px"),
                ...ease(at(TOTAL), { opacity: 0, transform: "scale(0.3)" }),
              }}
            >
              {at(TOTAL) && (
                <span className="-inset-[9px] absolute rounded-full border border-clay opacity-0 motion-safe:animate-[intent-halo_1.6s_var(--ease-soft)_0.4s_both]" />
              )}
            </span>
          </div>

          <div className="order-2 grid gap-[4px] px-[2px] pt-[18px] lg:order-none lg:col-start-1 lg:self-end lg:px-[14px] lg:pt-0 lg:pb-[4px]">
            <MonoLabel className={cx(KICK, "text-stone")}>
              {copy.routing.kicker}
            </MonoLabel>
            <p className="max-w-[34ch] font-mono text-[11px] text-stone leading-[1.5]">
              {copy.routing.note}
            </p>
          </div>
          <div className="relative grid gap-[12px] pt-[46px] lg:col-start-2 lg:grid-cols-2 lg:gap-[16px]">
            <span
              className="absolute top-[22px] left-1/4 h-[24px] rounded-tl-[10px] border-olive/60 border-t border-l border-dashed max-lg:hidden"
              style={{ width: beforeTotal("25%") }}
            />
            <span
              className={cx(
                STEM,
                "top-[-26px] h-[48px]",
                routed ? "bg-clay" : "bg-mute/70",
              )}
              style={{ left: beforeTotal("1px"), ...ease(routed, {}, 500) }}
            />
            <span
              className={cx(
                STEM,
                "top-[22px] h-[24px]",
                routed ? "bg-clay" : "bg-mute/70",
              )}
              style={{
                left: beforeTotal("1px"),
                ...ease(routed, {}, 500, 350),
              }}
            />
            <span
              className={cx(
                "absolute top-[18px] z-1 size-[9px] rounded-full border-[1.5px] bg-paper",
                routed ? "border-clay" : "border-mute",
              )}
              style={{
                left: beforeTotal("4.5px"),
                ...ease(routed, {}, 400, 200),
              }}
            />
            {routed && (
              <span
                className="absolute top-[-26px] z-1 size-[8px] rounded-full bg-clay opacity-0 shadow-[0_0_0_2px_var(--color-paper)] motion-safe:animate-[intent-drop_1s_var(--ease-soft)_0.1s_both]"
                style={{ left: beforeTotal("4px") }}
              />
            )}

            <div className="grid content-start gap-[6px] rounded-[14px] border border-olive/45 border-dashed px-[16px] pt-[14px] pb-[15px]">
              <MonoLabel className={cx(KICK, "text-olive-deep")}>
                {copy.followUp.kicker}
              </MonoLabel>
              <div className="flex items-center gap-[10px]">
                <span className="grid size-[28px] shrink-0 place-items-center rounded-full border border-olive/50 text-olive-deep">
                  <Icon d={RECALL} className="size-[14px]" />
                </span>
                <span className="font-serif text-[19px] text-stone leading-[1.2] tracking-[-0.01em]">
                  {copy.followUp.title}
                </span>
              </div>
              <p className="text-pretty text-[13.5px] text-stone leading-[1.45]">
                {keep(copy.followUp.body)}
              </p>
            </div>
            <div
              className={cx(
                "grid content-start gap-[6px] rounded-[14px] border bg-card px-[16px] pt-[14px] pb-[15px] max-lg:-order-1",
                routed
                  ? "border-[color-mix(in_oklab,var(--color-clay)_55%,var(--color-line))] shadow-lift"
                  : "border-line",
              )}
              style={ease(routed, { opacity: 0.55 }, 700, 900)}
            >
              <MonoLabel
                className={cx(KICK, routed ? "text-clay-deep" : "text-stone")}
                style={ease(routed, {}, 500, 1000)}
              >
                {copy.callNow.kicker}
              </MonoLabel>
              <div className="flex items-center gap-[10px]">
                <span
                  className={cx(
                    "grid size-[28px] shrink-0 place-items-center rounded-full border",
                    routed
                      ? "border-clay bg-clay text-paper"
                      : "border-line bg-paper text-stone",
                  )}
                  style={ease(routed, {}, 500, 1000)}
                >
                  <Icon d={PHONE} className="size-[14px]" />
                </span>
                <span className="font-serif text-[19px] text-ink leading-[1.2] tracking-[-0.01em]">
                  {copy.callNow.title}
                </span>
              </div>
              <p className="text-pretty text-[13.5px] text-ink-2 leading-[1.45]">
                {keep(copy.callNow.body)}
              </p>
              <MonoLabel
                className="mt-[4px] inline-flex h-[26px] items-center gap-[8px] justify-self-start whitespace-nowrap rounded-full border border-line bg-paper px-[10px] text-[11px] text-ink-2 leading-none"
                style={ease(
                  routed,
                  { opacity: 0, transform: "translateY(4px)" },
                  700,
                  1500,
                )}
              >
                <span className="flex h-[11px] items-center gap-[2px]">
                  {WAVE.map((s, k) => (
                    <span
                      key={s}
                      className={cx(
                        "h-full w-[2px] rounded-[1px] bg-clay",
                        routed &&
                          "motion-safe:animate-[ro-wave_1.1s_ease-in-out_infinite]",
                      )}
                      style={{
                        transform: `scaleY(${s})`,
                        animationDelay: `${k * -180}ms`,
                      }}
                    />
                  ))}
                </span>
                {copy.callNow.chip}
              </MonoLabel>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// One piece of evidence: a card in the ledger (dashed, with no weight, for context).
function Card({
  on,
  ctx = false,
  label,
  detail,
  weight,
}: {
  on: boolean;
  ctx?: boolean;
  label: string;
  detail: string;
  weight?: string;
}) {
  return (
    <div
      className={cx(
        "relative z-1 grid min-h-[48px] grid-cols-[minmax(0,1fr)_auto] items-center gap-[12px] self-center rounded-[11px] border border-line px-[14px] py-[7px] max-lg:mt-[10px] lg:col-start-1",
        ctx
          ? "border-dashed"
          : "bg-card shadow-[0_1px_2px_color-mix(in_oklab,var(--color-ink)_4%,transparent)]",
      )}
      style={ease(on, {
        opacity: 0,
        transform: "translateY(-16px) rotate(-1.2deg)",
      })}
    >
      <div className="min-w-0">
        <p className="font-medium text-[13.5px] text-ink leading-[1.35]">
          {label}
        </p>
        <MonoLabel className="block text-[11px] text-stone leading-[1.4] lg:truncate">
          {detail}
        </MonoLabel>
      </div>
      {weight && (
        <MonoLabel className="min-w-[3ch] text-right text-[13px] text-ink tabular-nums">
          {weight}
        </MonoLabel>
      )}
    </div>
  );
}

// A card's track on the scale. On phones each card carries its own: a hairline with
// the call-now tick (clay once crossed); from lg the chart's gridlines take over.
function Track({
  crossed,
  children,
}: {
  crossed: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative z-1 h-[22px] lg:col-start-2 lg:h-auto">
      <span className="absolute inset-x-0 top-1/2 h-px bg-line lg:hidden" />
      <span
        className={cx(
          "absolute top-[calc(50%-6px)] h-[12px] w-px lg:hidden",
          crossed ? "bg-clay-deep" : "bg-ink/30",
        )}
        style={{ left: pct(callNow) }}
      />
      {children}
    </div>
  );
}
