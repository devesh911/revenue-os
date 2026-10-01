import type { CSSProperties, RefCallback } from "react";

// Scroll reveal, CSS-first. `reveal(delayMs)` returns the props that mark an
// element for a one-shot fade-and-rise (styles.css owns the transition), including
// a ref that observes the node as it mounts — so a block that mounts late still
// reveals. `armReveal()` — called once, in main.tsx before the page mounts — opts
// the document in (html[data-motion]); only then is anything hidden, and every block
// is hidden from its first frame, so it only ever rises in. (Opted in any later, a
// block already styled as shown would fade out first.) Under reduced motion or
// without IntersectionObserver nothing is observed and nothing hides.
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

export function armReveal(): void {
  if (motionOk()) document.documentElement.dataset.motion = "";
}
