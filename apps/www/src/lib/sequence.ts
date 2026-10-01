import { type RefObject, useEffect, useRef, useState } from "react";
import { useStill } from "./motion";

// Drives a looping, step-by-step visual: `starts[i]` is when step i begins (ms from
// the loop's start; starts[0] is 0). After the last step it holds `hold` ms, reports
// `resetting` for FADE ms (the visual fades out), then starts over. It runs only
// while the visual is a third on screen (or fills most of the viewport, for a tall
// one on a short screen) in a visible tab and the page's
// Pause switch (useStill) is off (`playing` says so: a visual chimes or narrates only
// then). Reduced motion, or no IntersectionObserver, shows the final step and never
// moves — so does the server render — and so does a visual the Pause switch caught
// before it ever ran (Play then starts it from its end-of-loop fade). `settled` says
// the visual is showing that finished frame: mark its root data-settled so its entry
// animations complete at once (styles.css) instead of freezing on their first frame.
const FADE = 450;
const IN_VIEW = 0.35;
const FILLS_VIEW = 0.6;
// 0.01 apart, so even a stage many screens tall reports while it fills the view
const THRESHOLDS = Array.from({ length: 36 }, (_, i) => i / 100);

export interface Sequence {
  step: number;
  resetting: boolean;
  playing: boolean;
  settled: boolean;
}

export function useSequence(
  ref: RefObject<HTMLElement | null>,
  starts: readonly number[],
  hold: number,
  // on: false — something else drives this visual (it gets its step as a prop), so
  // never observe or tick. loop: [first, end] — play only those beats: after `end`
  // (its own time, or `hold` if it is the last beat) fade and go back to `first`,
  // instead of moving on.
  { on = true, loop }: { on?: boolean; loop?: readonly [number, number] } = {},
): Sequence {
  const last = starts.length - 1;
  const [first, end] = loop ?? [0, last];
  const [motion] = useState(
    () =>
      typeof window !== "undefined" &&
      "IntersectionObserver" in window &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [step, setStep] = useState(motion ? first : end);
  const [resetting, setResetting] = useState(false);
  const [live, setLive] = useState(false);
  const still = useStill();
  const played = useRef(false);
  const back = useRef(first); // where a fade returns to: the range it started in

  useEffect(() => {
    if (still && !played.current) setStep(end);
  }, [still, end]);

  // A new range that doesn't hold the current beat moves it in: to its first beat
  // when it will play, else to its finished frame, shown settled as if it never played.
  useEffect(() => {
    if (step >= first && step <= end) return;
    setResetting(false);
    if (motion && !still) setStep(first);
    else {
      played.current = false;
      setStep(end);
    }
  }, [step, first, end, motion, still]);

  useEffect(() => {
    const el = ref.current;
    if (!motion || !on || !el) return;
    let seen = false;
    const sync = () => setLive(seen && !document.hidden);
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries.at(-1);
        const view = e?.rootBounds?.height ?? window.innerHeight;
        seen =
          !!e &&
          (e.intersectionRatio >= IN_VIEW ||
            e.intersectionRect.height >= view * FILLS_VIEW);
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
  }, [motion, on, ref]);

  useEffect(() => {
    if (!live || still) return;
    played.current = true;
    const done = step >= end;
    const gap = (i: number) => (starts[i + 1] ?? 0) - (starts[i] ?? 0);
    const wait = resetting
      ? FADE
      : done
        ? end === last
          ? hold
          : gap(end)
        : gap(step);
    const id = setTimeout(() => {
      if (resetting) {
        setResetting(false);
        setStep(back.current);
      } else if (done) {
        back.current = first;
        setResetting(true);
      } else setStep(step + 1);
    }, wait);
    return () => clearTimeout(id);
  }, [live, still, step, resetting, starts, hold, last, first, end]);

  return {
    step,
    resetting,
    playing: live && !still,
    settled: !motion || (still && !played.current),
  };
}
