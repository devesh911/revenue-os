// Tiny className joiner — the www design system's only "utility", mirroring the
// console's src/ui/cx.ts. No clsx dependency (no-new-deps rail); falsy parts drop
// out so callers can write `cond && "class"`.
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
