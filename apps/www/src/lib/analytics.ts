// Funnel analytics through Plausible (cookieless — no consent banner). The
// site-specific script URL comes from VITE_PLAUSIBLE_SRC; unset, track() is a
// no-op (logged in dev). Event names are the Plausible goals to create:
// "Demo click" → "Booking start" → "Booking complete" is the funnel; "Sample play"
// and the heard_sample prop show whether listening goes with booking.
type EventName =
  | "Demo click"
  | "Booking start"
  | "Booking complete"
  | "Booking error"
  | "Sample play";

type Plausible = ((
  event: string,
  options?: { props?: Record<string, string> },
) => void) & {
  q?: unknown[][];
  o?: unknown;
  init?: (options?: unknown) => void;
};

declare global {
  interface Window {
    plausible?: Plausible;
  }
}

let heardSample = false;
export const hasHeardSample = (): boolean => heardSample;

export function track(event: EventName, props?: Record<string, string>): void {
  if (event === "Sample play") heardSample = true;
  if (typeof window === "undefined") return;
  window.plausible?.(event, props && { props });
  if (import.meta.env?.DEV) console.debug("[track]", event, props ?? {});
}

// Loads the Plausible script with its queue stub, so events fired before it
// arrives are kept. Only an https URL is accepted.
export function initAnalytics(src: string | undefined): void {
  if (!src || typeof document === "undefined") return;
  try {
    if (new URL(src).protocol !== "https:") return;
  } catch {
    return;
  }
  const queue: Plausible = Object.assign(
    (...args: unknown[]) => {
      queue.q = queue.q ?? [];
      queue.q.push(args);
    },
    {
      init: (o?: unknown) => {
        queue.o = o ?? {};
      },
    },
  );
  window.plausible = window.plausible ?? queue;
  window.plausible.init?.();
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  document.head.append(script);
}
