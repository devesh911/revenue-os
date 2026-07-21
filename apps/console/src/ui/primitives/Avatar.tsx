// Initials avatar — a warm neutral circle; no images yet. Derives up to two initials
// from `name` (first + last word); falls back to "?" for empty strings.
import { cx } from "../cx";

const SIZES = {
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-xs",
} as const;

export type AvatarProps = {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
};

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

export function Avatar({ name, size = "md", className }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center rounded-pill",
        "bg-nav-active font-semibold text-ink-soft",
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
