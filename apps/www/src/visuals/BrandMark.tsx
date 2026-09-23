// The Revenue OS mark: a clay dot (the lead) with two ink arcs (the voice reaching
// it). Decorative — always paired with the visible wordmark — so aria-hidden.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="-1.25 0 28 28"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="8" cy="14" r="4" className="fill-clay" />
      <path
        d="M13.66 8.34a8 8 0 0 1 0 11.32"
        className="stroke-current"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M16.84 5.16a12.5 12.5 0 0 1 0 17.68"
        className="stroke-current"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
