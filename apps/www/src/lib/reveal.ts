import { type CSSProperties, useLayoutEffect } from "react";

// Scroll reveal, CSS-first. `reveal(delayMs)` returns the props that mark an
// element for a one-shot fade-and-rise (styles.css owns the transition);
// `useReveal()` — called once, in App — opts the document in (html[data-motion])
// and flips data-shown as each marked element enters the viewport. It runs in a
// layout effect so nothing flashes before paint, and bails out (content simply
// stays visible) under reduced motion or without IntersectionObserver.
export function reveal(delayMs = 0): {
  "data-reveal": "";
  style: CSSProperties;
} {
  return {
    "data-reveal": "",
    style: { "--reveal-delay": `${delayMs}ms` } as CSSProperties,
  };
}

export function useReveal(): void {
  useLayoutEffect(() => {
    if (
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const root = document.documentElement;
    root.dataset.motion = "";
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.shown = "";
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0 },
    );
    for (const el of document.querySelectorAll("[data-reveal]")) io.observe(el);
    return () => {
      io.disconnect();
      delete root.dataset.motion;
    };
  }, []);
}
