import { type CSSProperties, type RefCallback, useLayoutEffect } from "react";

// Scroll reveal, CSS-first. `reveal(delayMs)` returns the props that mark an
// element for a one-shot fade-and-rise (styles.css owns the transition), including
// a ref that observes the node as it mounts — so a block that mounts late still
// reveals. `useReveal()` — called once, in App — opts the document in
// (html[data-motion]) before paint; only then is anything hidden. Under reduced
// motion or without IntersectionObserver nothing is observed and nothing hides.
const REDUCED = "(prefers-reduced-motion: reduce)";
const motionOk = () =>
  "IntersectionObserver" in window && !window.matchMedia(REDUCED).matches;

let io: IntersectionObserver | undefined;

const observe: RefCallback<Element> = (node) => {
  if (!node || !motionOk()) return;
  // Already on the first screen: rise in now. (The observer's -8% bottom margin would
  // hold a block starting in the screen's bottom band until the visitor scrolls.) Two
  // frames, so the hidden state paints first and the rise still plays.
  if (node.getBoundingClientRect().top < window.innerHeight) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        (node as HTMLElement).dataset.shown = "";
      }),
    );
    return;
  }
  io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        (e.target as HTMLElement).dataset.shown = "";
        io?.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  io.observe(node);
  return () => io?.unobserve(node);
};

export function reveal(delayMs = 0): {
  "data-reveal": "";
  ref: RefCallback<Element>;
  style: CSSProperties;
} {
  return {
    "data-reveal": "",
    ref: observe,
    style: { "--reveal-delay": `${delayMs}ms` } as CSSProperties,
  };
}

export function useReveal(): void {
  useLayoutEffect(() => {
    if (!motionOk()) return;
    const root = document.documentElement;
    root.dataset.motion = "";
    return () => {
      delete root.dataset.motion;
    };
  }, []);
}
