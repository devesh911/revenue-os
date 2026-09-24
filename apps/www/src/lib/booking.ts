import { z } from "zod";

// Demo booking against Cal.com's public v2 API: a public event type needs no key
// and the API allows browser origins, so the marketing site can list open times
// and create the booking itself (the buyer gets Cal.com's confirmation email and
// calendar invite). Configure with VITE_CALCOM_USERNAME + VITE_CALCOM_EVENT_SLUG;
// the event type needs a "company" booking question. Unconfigured, a local preview
// adapter stands in so the flow works end to end — and the dialog says so.
const API = "https://api.cal.com/v2";
const SLOTS_VERSION = "2024-09-04";
const BOOKINGS_VERSION = "2026-02-25";
const DAYS_AHEAD = 14;

export interface DaySlots {
  date: string; // YYYY-MM-DD in the requested time zone
  starts: string[]; // ISO instants
}

export interface BookingRequest {
  start: string;
  name: string;
  email: string;
  company: string;
  phone?: string;
  timeZone: string;
  source: string;
}

export type BookingFailure = "unavailable" | "rejected" | "server" | "network";

export class BookingError extends Error {
  constructor(
    readonly kind: BookingFailure,
    message: string,
  ) {
    super(message);
  }
}

const SlotsResponse = z.object({
  status: z.literal("success"),
  data: z.record(z.string(), z.array(z.object({ start: z.string() }))),
});
const BookingResponse = z.object({
  status: z.literal("success"),
  data: z.object({ uid: z.string(), start: z.string() }),
});
const ErrorResponse = z.object({
  error: z.object({ message: z.string() }).optional(),
});

interface CalConfig {
  username?: string;
  eventSlug?: string;
  fetch?: typeof fetch;
}

export function createBookingClient({
  username,
  eventSlug,
  fetch: f,
}: CalConfig) {
  const live = Boolean(username && eventSlug);
  const http = f ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  async function send(url: string, init: RequestInit): Promise<unknown> {
    let res: Response;
    try {
      res = await http(url, init);
    } catch {
      throw new BookingError("network", "request failed");
    }
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) return body;
    const message = ErrorResponse.safeParse(body).data?.error?.message ?? "";
    const taken =
      res.status === 409 ||
      /not available|already has booking|no available|can't be booked at the "?start"? time|in the past/i.test(
        message,
      );
    throw new BookingError(
      taken ? "unavailable" : res.status >= 500 ? "server" : "rejected",
      message || `HTTP ${res.status}`,
    );
  }

  async function fetchSlots(
    timeZone: string,
    now = new Date(),
  ): Promise<DaySlots[]> {
    if (!live) return previewSlots(timeZone, now);
    const end = new Date(now.getTime() + DAYS_AHEAD * 86_400_000);
    const q = new URLSearchParams({
      username: username as string,
      eventTypeSlug: eventSlug as string,
      start: now.toISOString(),
      end: end.toISOString(),
      timeZone,
    });
    const body = await send(`${API}/slots?${q}`, {
      headers: { "cal-api-version": SLOTS_VERSION },
    });
    const parsed = SlotsResponse.safeParse(body);
    if (!parsed.success)
      throw new BookingError("rejected", "unexpected slots response");
    return Object.entries(parsed.data.data)
      .map(([date, slots]) => ({ date, starts: slots.map((s) => s.start) }))
      .filter((d) => d.starts.length > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async function createBooking(
    req: BookingRequest,
  ): Promise<{ uid: string; start: string }> {
    if (!live) {
      await new Promise((r) => setTimeout(r, 600));
      return { uid: "preview", start: req.start };
    }
    const body = await send(`${API}/bookings`, {
      method: "POST",
      headers: {
        "cal-api-version": BOOKINGS_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        start: new Date(req.start).toISOString(),
        username,
        eventTypeSlug: eventSlug,
        attendee: {
          name: req.name,
          email: req.email,
          timeZone: req.timeZone,
          language: "en",
          ...(req.phone ? { phoneNumber: req.phone } : {}),
        },
        bookingFieldsResponses: { company: req.company },
        metadata: { source: req.source },
      }),
    });
    const parsed = BookingResponse.safeParse(body);
    if (!parsed.success)
      throw new BookingError("rejected", "unexpected booking response");
    return parsed.data.data;
  }

  return { live, fetchSlots, createBooking };
}

// Preview slots: the next 10 working days, 10:00–17:30 in India, every 30 minutes,
// a few gaps so it reads like a real calendar, nothing in the past.
export function previewSlots(timeZone: string, now = new Date()): DaySlots[] {
  const IST = 5.5 * 3_600_000;
  const todayIst = Math.floor((now.getTime() + IST) / 86_400_000) * 86_400_000;
  const byDate = new Map<string, string[]>();
  for (let d = 0, workdays = 0; workdays < 10 && d < 21; d++) {
    const day = todayIst + d * 86_400_000; // midnight IST, as UTC fields
    const weekday = new Date(day).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    let added = false; // a day counts only if it still has a slot (not a finished today)
    for (let m = 10 * 60; m <= 17 * 60 + 30; m += 30) {
      const instant = day + m * 60_000 - IST;
      if (instant <= now.getTime() + 3_600_000 || (m / 30 + d) % 4 === 0)
        continue;
      const iso = new Date(instant).toISOString();
      const date = dateIn(timeZone, iso);
      byDate.set(date, [...(byDate.get(date) ?? []), iso]);

      added = true;
    }
    if (added) workdays++;
  }
  return [...byDate].map(([date, starts]) => ({ date, starts }));
}

// YYYY-MM-DD of an instant in a time zone (en-CA formats dates that way).
export function dateIn(timeZone: string, iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}

// Phone → E.164. Indian numbers work as typed ("98765 43210", "098765-43210", a
// 10-digit landline with its STD code); +91 must carry exactly 10 national digits.
// Other countries need their + code; a leading-0 local number is only read as
// Indian when the visitor is in India (`localIsIndia`). null = not a valid number.
export function normalisePhone(
  raw: string,
  localIsIndia = true,
): string | null {
  const digits = raw.replace(/[\s\-().]/g, "");
  const indian = digits.match(/^(?:\+91|0091)(\d*)$/);
  if (indian)
    return /^[2-9]\d{9}$/.test(indian[1] ?? "") ? `+91${indian[1]}` : null;
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  if (!localIsIndia) return null;
  const local = digits.replace(/^(?:91|0)(?=\d{10}$)/, "");
  return /^[2-9]\d{9}$/.test(local) ? `+91${local}` : null;
}

export const isEmail = (v: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

const env = import.meta.env ?? {};
export const booking = createBookingClient({
  username: env.VITE_CALCOM_USERNAME,
  eventSlug: env.VITE_CALCOM_EVENT_SLUG,
});
