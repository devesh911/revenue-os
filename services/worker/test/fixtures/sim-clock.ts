// T9 (task-49) — the M2 replay's SIMULATED CLOCK. Time advances ONLY via advance()/set() plus a
// tick(); there are no real waits and no wake_at mutation. The scheduler's `ctx.now`, the handlers'
// `deps.now`, and the guard pipeline's `ctx.now` all read this one clock, so a multi-day lifecycle
// (call → wait 2h → whatsapp → wait_until 11:00 next day → call) replays deterministically in ms.
// G1: runtime-agnostic (Date only — no timers, no Bun globals).
export class SimClock {
  private t: number;

  constructor(start: Date | string) {
    this.t = new Date(start).getTime();
  }

  /** The current simulated instant. Injected wherever a clock is needed. */
  now(): Date {
    return new Date(this.t);
  }

  /** Move the clock forward by `ms` (e.g. a `wait PT2H` step). */
  advance(ms: number): void {
    this.t += ms;
  }

  /** Jump the clock to an absolute instant (e.g. the run's next `wake_at`). */
  set(when: Date | string): void {
    this.t = new Date(when).getTime();
  }
}
