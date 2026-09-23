// A 16px line glyph drawn in currentColor — the page's one icon idiom. Every path
// lives here. Decorative: always beside real text or inside a labelled control.
export const CHECK = "M3.5 8.5 6.5 11.5 12.5 4.5";
export const RECALL = "M12.8 9.5A5 5 0 1 1 11.5 4.3M12 1.8v2.9H9.1";
export const INFO =
  "M8 1.75a6.25 6.25 0 1 0 0 12.5a6.25 6.25 0 1 0 0-12.5M8 7.25v4M8 4.9h.01";
export const PAUSE = "M5.5 3.5v9M10.5 3.5v9";
export const PLAY = "M5 3.5v9l7.5-4.5Z";
export const MENU = "M2.5 5.5h11M2.5 10.5h11";
export const CLOSE = "M4 4l8 8M12 4l-8 8";

export function Icon({ d, className }: { d: string; className?: string }) {
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
