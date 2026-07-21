// task-25 — quiet-hours predicate (moat invariant #4: guardrails-as-config gate the outbound
// send pipeline). Pure: the caller injects `now`; the wall-clock is computed IN `tz` (never the
// host tz) via Intl, so the same UTC instant yields the same verdict on every runtime.
// Boundary semantics: START inclusive, END exclusive; windows may wrap past midnight.
// G1: runtime-agnostic (Intl only — no date libs, no Bun globals).

/** Minutes-since-midnight of an "HH:MM" 24h string. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * True iff `now`, read as wall-clock time in `tz`, falls in [start, end).
 * `hourCycle: "h23"` renders midnight as "00" (not "24" as `hour12:false` does on some
 * runtimes), keeping the 00:00 boundary correct. Non-wrapping (s <= e): cur >= s && cur < e.
 * Wrapping (s > e, e.g. 21:00–09:00): cur >= s || cur < e.
 */
export function isWithinQuietHours(
  now: Date,
  start: string,
  end: string,
  tz: string,
): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const cur = Number(hour) * 60 + Number(minute);

  const s = toMinutes(start);
  const e = toMinutes(end);
  return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
}
