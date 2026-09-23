// A 16px line glyph drawn in currentColor — the page's one icon idiom (checks,
// the re-call loop, the info mark). Decorative: always beside real text.
export const CHECK = "M3.5 8.5 6.5 11.5 12.5 4.5";
export const RECALL = "M12.8 9.5A5 5 0 1 1 11.5 4.3M12 1.8v2.9H9.1";

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
