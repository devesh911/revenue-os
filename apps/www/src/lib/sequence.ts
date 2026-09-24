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

export function useSequence(
  ref: RefObject<HTMLElement | null>,
  starts: readonly number[],
  hold: number,
): { step: number; resetting: boolean; playing: boolean; settled: boolean } {
  const last = starts.length - 1;
  const [motion] = useState(
    () =>
      typeof window !== "undefined" &&
      "IntersectionObserver" in window &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [step, setStep] = useState(motion ? 0 : last);
  const [resetting, setResetting] = useState(false);
  const [live, setLive] = useState(false);
  const still = useStill();
  const played = useRef(false);

  useEffect(() => {
    if (still && !played.current) setStep(last);
  }, [still, last]);

  useEffect(() => {
    const el = ref.current;
    if (!motion || !el) return;
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
  }, [motion, ref]);

  useEffect(() => {
    if (!live || still) return;
    played.current = true;
    const done = step >= last;
    const wait = resetting
      ? FADE
      : done
        ? hold
        : (starts[step + 1] ?? 0) - (starts[step] ?? 0);
    const id = setTimeout(() => {
      if (resetting) {
        setResetting(false);
        setStep(0);
      } else if (done) setResetting(true);
      else setStep(step + 1);
    }, wait);
    return () => clearTimeout(id);
  }, [live, still, step, resetting, starts, hold, last]);

  return {
    step,
    resetting,
    playing: live && !still,
    settled: !motion || (still && !played.current),
  };
}
