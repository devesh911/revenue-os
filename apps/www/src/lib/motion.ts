import { type RefObject, useEffect, useSyncExternalStore } from "react";

// The page-wide "pause animations" switch (WCAG 2.2.2 — moving content can be
// stopped). setStill() flags html[data-still], which freezes every CSS animation
// (styles.css); JS-driven visuals read useStill() and hold their sequence.
const subs = new Set<() => void>();
const isStill = () => document.documentElement.hasAttribute("data-still");

export function setStill(still: boolean): void {
  document.documentElement.toggleAttribute("data-still", still);
  for (const fn of subs) fn();
}

export function useStill(): boolean {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    isStill,
    () => false,
  );
}

// Runs an SVG's animations only while it is on screen and motion isn't paused:
// SMIL via (un)pauseAnimations(), CSS keyframes inside it via data-paused
// (styles.css). Off-screen loops otherwise cost main-thread work for nothing.
export function useLiveSvg(ref: RefObject<SVGSVGElement | null>): void {
  const still = useStill();
  useEffect(() => {
    const svg = ref.current;
    if (!svg || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      const live = !still && entries.at(-1)?.isIntersecting === true;
      if (live) svg.unpauseAnimations();
      else svg.pauseAnimations();
      svg.toggleAttribute("data-paused", !live);
    });
    io.observe(svg);
    return () => io.disconnect();
  }, [ref, still]);
}
