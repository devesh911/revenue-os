import {
  type CSSProperties,
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { sampleCall as call } from "../content/hero";
import { Card } from "../design/Card";
import { Label } from "../design/Label";
import { track } from "../lib/analytics";
import { cx } from "../lib/cx";
import { Icon, PAUSE, PLAY, RECALL } from "./Icon";

// The hero's sample call — useful before it plays: the lead, what the call
// captured (the outcome, "Next action" accented) and the whole transcript are on
// first paint. Only the visitor starts it (no autoplay): the round button (its row
// is the hit area), a transcript line (seeks there), or the hero's listen button
// through the `play` handle. The transcript is a capped box at every width (taller
// below lg, fading at its foot); while the call plays the spoken line is marked
// and kept in view by scrolling that box, never the page. Below sm each speaker
// sits above its line so the words get the full width. The scrubber is a real
// range input (arrows step 5 s); the "playing" bars are the page's one looping
// animation, rendered only while audio runs. In forced colours the scrubber falls
// back to the native slider and the spoken-line marker draws in Highlight.
// "Sample play" is tracked once per page view, with its source.
export interface SampleCallHandle {
  play: () => void;
}

type Source = "player" | "hero-link";

export const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const STEP: Record<string, number> = {
  ArrowLeft: -5,
  ArrowDown: -5,
  ArrowRight: 5,
  ArrowUp: 5,
};

const NAV = 64; // the sticky nav's height

// A 4px track filled in clay up to --p over a ≥3:1 unplayed track, with an ink
// thumb; the input box stays tall (44px on touch, overlapping its neighbours) so
// it's easy to grab.
const RANGE =
  "relative z-10 block h-[20px] w-full cursor-pointer appearance-none bg-transparent forced-colors:appearance-auto pointer-coarse:-my-[12px] pointer-coarse:h-[44px] [&::-moz-range-progress]:h-[4px] [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-clay [&::-moz-range-thumb]:size-[14px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-ink [&::-moz-range-track]:h-[4px] [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-line-strong [&::-webkit-slider-runnable-track]:h-[4px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--color-clay)_var(--p),var(--color-line-strong)_var(--p))] [&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:size-[14px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink";

export function SampleCall({ ref }: { ref?: Ref<SampleCallHandle> }) {
  const audio = useRef<HTMLAudioElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const tracked = useRef(false);
  const hint = useId();
  const [t, setT] = useState(0);
  const [duration, setDuration] = useState<number>(call.seconds);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false); // playback has actually begun
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);

  const started = playing || t > 0;
  const following = started && !ended; // the transcript tracks the audio
  const active = following
    ? call.lines.filter((l) => l.at <= t).length - 1
    : -1;
  const action = playing
    ? call.pause
    : ended
      ? call.replay
      : played
        ? call.resume
        : call.play;

  function play(source: Source, at?: number) {
    const a = audio.current;
    if (!a) return;
    if (at !== undefined) a.currentTime = at;
    // A play() interrupted by a pause isn't a failure; load errors reach onError.
    a.play().then(
      () => {
        if (tracked.current) return;
        tracked.current = true;
        track("Sample play", { source });
      },
      () => {},
    );
  }

  function seek(to: number) {
    const at = Math.min(Math.max(to, 0), duration);
    if (audio.current) audio.current.currentTime = at;
    setT(at);
    setEnded(false);
  }

  // The hero link: if any of the controls + transcript box is hidden (off-screen
  // or under the sticky nav), scroll the page the least that shows them all —
  // the controls never above the nav — then play, inside the same click. Focus
  // lands on the round button, so keyboard and screen-reader users can pause.
  useImperativeHandle(ref, () => ({
    play: () => {
      const top = controls.current?.getBoundingClientRect().top;
      const bottom = list.current?.getBoundingClientRect().bottom;
      if (top !== undefined && bottom !== undefined) {
        const by =
          top < NAV + 8
            ? top - NAV - 8
            : Math.min(Math.max(bottom - innerHeight + 16, 0), top - NAV - 8);
        if (by) scrollBy({ top: by });
      }
      button.current?.focus({ preventScroll: true });
      play("hero-link");
    },
  }));

  // Smooth progress while playing (timeupdate alone fires ~4×/s).
  useEffect(() => {
    if (!playing) return;
    let id = requestAnimationFrame(function tick() {
      setT(audio.current?.currentTime ?? 0);
      id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [playing]);

  // Keep the spoken line inside the transcript box — scrolls the box, not the page.
  useEffect(() => {
    const box = list.current;
    const line = box?.children[active] as HTMLElement | undefined;
    if (!box || !line || box.scrollHeight <= box.clientHeight) return;
    const { offsetTop: top, offsetHeight: h } = line;
    const foot = box.scrollTop + box.clientHeight - 24; // above the faded foot
    if (top < box.scrollTop || top + h > foot) box.scrollTo({ top: top - 4 });
  }, [active]);

  return (
    <Card
      tone="product"
      role="region"
      aria-label={call.label}
      className="shadow-lift"
    >
      {/* biome-ignore lint/a11y/useMediaCaption: the full transcript is rendered beside the player */}
      <audio
        ref={audio}
        preload="metadata"
        src={call.src}
        onPlay={() => {
          setPlaying(true);
          setPlayed(true);
          setEnded(false);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setEnded(true)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onError={() => setFailed(true)}
      />

      <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px] border-line border-b px-[16px] py-[10px] sm:px-[24px]">
        <span className="inline-flex h-[24px] items-center rounded-full bg-ink/[0.06] px-[9px] font-medium text-[13px] text-ink">
          {call.label}
        </span>
        <Label className="text-pretty">{call.disclosure}</Label>
      </div>

      <div className="px-[16px] pt-[16px] sm:px-[24px]">
        {/* Phones: name · source · speed. From sm: name + speed, source below. */}
        <div className="grid gap-y-[2px] sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-x-[16px]">
          <p className="font-semibold text-[17px] text-ink tracking-[-0.01em] sm:row-start-1">
            {call.lead}
          </p>
          <p className="text-pretty text-[14px] text-ink-2 sm:col-span-2 sm:row-start-2">
            {call.source}
          </p>
          <p className="text-[14px] text-ink-2 tabular-nums max-sm:mt-[4px] sm:col-start-2 sm:row-start-1">
            {call.calledAfter}
          </p>
        </div>

        <h3 className="mt-[18px] font-medium text-[14px] text-ink">
          {call.resultTitle}
        </h3>
        <dl className="mt-[6px] divide-y divide-line">
          {call.result.map((row, i) => {
            const outcome = i === call.result.length - 1; // "Next action"
            return (
              <div
                key={row.label}
                className="grid py-[8px] sm:grid-cols-[128px_1fr] sm:gap-x-[14px]"
              >
                <dt
                  className={cx(
                    "text-[14px] leading-[22px]",
                    outcome ? "font-medium text-clay-deep" : "text-ink-2",
                  )}
                >
                  {row.label}
                </dt>
                <dd
                  className={cx(
                    "text-pretty text-[15px] text-ink leading-[22px]",
                    outcome && "font-medium",
                  )}
                >
                  {row.value}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      <div
        ref={controls}
        className="relative mx-[16px] mt-[12px] flex items-center gap-[14px] border-line border-y py-[14px] sm:mx-[24px]"
      >
        <button
          ref={button}
          type="button"
          aria-label={action}
          disabled={failed}
          onClick={() => (playing ? audio.current?.pause() : play("player"))}
          className="grid size-[48px] shrink-0 cursor-pointer place-items-center rounded-full border border-transparent bg-ink text-paper transition-colors duration-150 after:absolute after:inset-0 hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon
            d={playing ? PAUSE : ended ? RECALL : PLAY}
            className={cx("size-[18px]", !playing && !ended && "fill-current")}
          />
        </button>
        {failed ? (
          <p className="min-w-0 flex-1 text-[14px] text-ink-2">
            {call.unavailable}
          </p>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="flex min-h-[22px] items-center justify-between gap-[12px]">
              {playing ? (
                <span
                  aria-hidden="true"
                  className="flex h-[14px] items-end gap-[3px]"
                >
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="h-full w-[3px] origin-bottom animate-[ro-eq_0.9s_ease-in-out_infinite] rounded-full bg-clay forced-colors:bg-[CanvasText] forced-color-adjust-none"
                      style={{ animationDelay: `${i * -0.23}s` }}
                    />
                  ))}
                </span>
              ) : (
                // The button carries this as its name; shown here, not read twice.
                <span aria-hidden="true" className="font-medium text-[15px]">
                  {action}
                </span>
              )}
              <span className="shrink-0 font-mono text-[13px] text-ink-2 tabular-nums">
                {started ? `${clock(t)} / ${clock(duration)}` : clock(duration)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={duration}
              step="any"
              value={Math.min(t, duration)}
              aria-label={call.seek}
              aria-valuetext={call.position(
                Math.floor(t),
                Math.floor(duration),
              )}
              onChange={(e) => seek(Number(e.currentTarget.value))}
              onKeyDown={(e) => {
                const step = STEP[e.key];
                if (!step) return;
                e.preventDefault();
                seek(t + step);
              }}
              style={{ "--p": `${(t / duration) * 100}%` } as CSSProperties}
              className={cx("mt-[4px] rounded-[6px]", RANGE)}
            />
          </div>
        )}
      </div>

      <div className="px-[16px] pt-[14px] pb-[10px] sm:px-[24px]">
        <h3 className="font-medium text-[14px] text-ink">{call.transcript}</h3>
        <span id={hint} hidden>
          {call.lineHint}
        </span>
        <ol
          ref={list}
          className="-mx-[10px] relative mt-[6px] max-h-[240px] scroll-pb-[28px] overflow-y-auto scroll-smooth pb-[18px] mask-b-from-[calc(100%-24px)] motion-reduce:scroll-auto lg:max-h-[204px]"
        >
          {call.lines.map((line, i) => (
            <li key={line.at}>
              <button
                type="button"
                aria-current={i === active || undefined}
                aria-describedby={hint}
                disabled={failed}
                onClick={() => play("player", line.at)}
                className={cx(
                  "-outline-offset-2 relative grid w-full cursor-pointer gap-x-[12px] sm:grid-cols-[52px_1fr] rounded-[8px] px-[10px] py-[7px] text-left pointer-coarse:py-[11px] transition-colors duration-150 before:absolute before:inset-y-[10px] before:left-0 before:w-[2px] before:rounded-full hover:bg-ink/[0.035] disabled:cursor-default",
                  i === active &&
                    "before:bg-clay before:forced-color-adjust-none forced-colors:before:bg-[Highlight]",
                  following && i !== active ? "text-ink-2" : "text-ink",
                )}
              >
                <span className="font-medium text-[13px] text-ink-2 leading-[20px] sm:leading-[22px]">
                  {call.speakers[line.who]}
                </span>
                <span className="text-pretty text-[15px] leading-[22px]">
                  {line.text}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
