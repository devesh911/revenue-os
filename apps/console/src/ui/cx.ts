// Tiny className joiner — the design system's only "utility". No clsx dependency
// (no-new-deps rail); falsy parts drop out so callers can write `cond && "class"`.
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
