import { useEffect, useId, useRef, useState } from "react";
import { hero, sampleCall } from "../content/hero";
import { CtaButton } from "../design/CtaButton";
import { track } from "../lib/analytics";
import { Icon, PAUSE, PLAY } from "./Icon";

// The hero's listen button: plays and pauses the sample recording in place — no
// player, no transcript. The pill never changes width: every label sits in one
// grid cell and only the current one shows. The recording loads on the first
// press (nothing is fetched until then); a failed load says so and the next
// press retries. "Sample play" is tracked once per page, on the first playback
// that actually starts. The honesty note (a text-to-speech recreation) sits
// right after the button, as a full-width item of the caller's flex row.
type State = "idle" | "playing" | "paused" | "ended";

const LABELS: Record<State, string> = {
  idle: hero.secondary,
  playing: sampleCall.pause,
  paused: sampleCall.resume,
  ended: sampleCall.play,
};

const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function SampleAudio({ className }: { className?: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const tracked = useRef(false);
  const [state, setState] = useState<State>("idle");
  const [failed, setFailed] = useState(false);
  const noteId = useId(); // the text-to-speech note describes the button

  useEffect(() => () => audio.current?.pause(), []);

  function fail() {
    audio.current = null; // the next press starts over with a fresh element
    setState("idle");
    setFailed(true);
  }

  function toggle() {
    let a = audio.current;
    if (a && !a.paused) return a.pause();
    if (!a) {
      const el = new Audio(sampleCall.src);
      // A dropped (failed) element's late events are ignored.
      const on = (type: string, next: () => void) =>
        el.addEventListener(type, () => {
          if (audio.current === el) next();
        });
      on("play", () => setState("playing"));
      on("pause", () => setState("paused"));
      on("ended", () => setState("ended"));
      on("error", fail);
      audio.current = a = el;
    }
    setFailed(false);
    const el = a;
    // A play() cut short by a pause isn't a failure; anything else is.
    el.play().then(
      () => {
        if (tracked.current) return;
        tracked.current = true;
        track("Sample play", { source: "hero-link" });
      },
      (e: unknown) => {
        if (audio.current === el && (e as Error)?.name !== "AbortError") fail();
      },
    );
  }

  return (
    <>
      <CtaButton
        variant="ghost"
        size="lg"
        describedBy={noteId}
        onClick={toggle}
        className={className}
      >
        <Icon
          d={state === "playing" ? PAUSE : PLAY}
          className="-ml-[4px] size-[14px] shrink-0"
        />
        <span className="grid">
          {(Object.keys(LABELS) as State[]).map((s) => (
            <span
              key={s}
              className={
                s === state ? "[grid-area:1/1]" : "invisible [grid-area:1/1]"
              }
            >
              {LABELS[s]}
            </span>
          ))}
        </span>
        <span className="font-mono text-[13px] text-stone tabular-nums">
          {clock(sampleCall.seconds)}
        </span>
      </CtaButton>
      <p
        id={noteId}
        className="mt-[4px] w-full max-w-[34rem] text-pretty text-[13px] text-stone leading-[1.55]"
      >
        <span role="status" className="text-ink-2">
          {failed && `${sampleCall.unavailable} `}
        </span>
        {sampleCall.disclosure}
      </p>
    </>
  );
}
