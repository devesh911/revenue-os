// Unit spec for the booking client (Cal.com v2 + the preview adapter) and the
// analytics hook. fetch is injected, so nothing leaves the machine; the request
// shapes pinned here are the ones Cal.com's public API documents.
import { afterEach, describe, expect, test } from "bun:test";
import { hasHeardSample, initAnalytics, track } from "../src/lib/analytics";
import {
  BookingError,
  createBookingClient,
  dateIn,
  isEmail,
  normalisePhone,
  previewSlots,
} from "../src/lib/booking";

const NOW = new Date("2026-09-23T05:00:00Z"); // Wed 10:30 IST
const TZ = "Asia/Kolkata";

type Call = { url: string; init: RequestInit };
function fakeFetch(status: number, body: unknown, calls: Call[] = []) {
  return Object.assign(
    async (url: string | URL | Request, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(body), { status });
    },
    { calls },
  ) as unknown as typeof fetch & { calls: Call[] };
}
const header = (init: RequestInit, name: string) =>
  new Headers(init.headers).get(name);

describe("preview adapter (no Cal.com configured)", () => {
  const days = previewSlots(TZ, NOW);

  test("offers up to ten working days, grouped by date, in order", () => {
    expect(days.length).toBeGreaterThan(5);
    expect(days.length).toBeLessThanOrEqual(10);
    const dates = days.map((d) => d.date);
    expect([...dates].sort()).toEqual(dates);
    for (const d of days) {
      const weekday = new Date(`${d.date}T12:00:00Z`).getUTCDay();
      expect(weekday === 0 || weekday === 6).toBe(false);
    }
  });

  test("every slot is 10:00–17:30 India time, at least an hour away", () => {
    for (const d of days) {
      for (const iso of d.starts) {
        const t = new Date(iso);
        expect(t.getTime()).toBeGreaterThan(NOW.getTime() + 3_600_000);
        const [h, m] = new Intl.DateTimeFormat("en-GB", {
          timeZone: TZ,
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
          .format(t)
          .split(":")
          .map(Number) as [number, number];
        const minutes = h * 60 + m;
        expect(minutes).toBeGreaterThanOrEqual(600);
        expect(minutes).toBeLessThanOrEqual(1050);
        expect(dateIn(TZ, iso)).toBe(d.date);
      }
    }
  });

  test("after hours, a finished today doesn't count: still ten working days", () => {
    const late = previewSlots(TZ, new Date("2026-09-23T11:30:00Z")); // Wed 17:00 IST

    expect(late.length).toBe(10);

    expect(late[0]?.date).toBe("2026-09-24");
  });

  test("an unconfigured client is not live and books without a network call", async () => {
    const f = fakeFetch(500, {});
    const client = createBookingClient({ fetch: f });
    expect(client.live).toBe(false);
    const res = await client.createBooking({
      start: "2026-09-25T05:30:00.000Z",
      name: "A",
      email: "a@b.co",
      company: "C",
      timeZone: TZ,
      source: "hero",
    });
    expect(res.uid).toBe("preview");
    expect(f.calls.length).toBe(0);
  });
});

describe("Cal.com client", () => {
  const config = { username: "revenue-os", eventSlug: "demo" };

  test("fetchSlots calls the public slots API and returns sorted, non-empty days", async () => {
    const f = fakeFetch(200, {
      status: "success",
      data: {
        "2026-09-25": [{ start: "2026-09-25T11:00:00.000+05:30" }],
        "2026-09-24": [
          { start: "2026-09-24T10:00:00.000+05:30" },
          { start: "2026-09-24T10:30:00.000+05:30" },
        ],
        "2026-09-26": [],
      },
    });
    const client = createBookingClient({ ...config, fetch: f });
    expect(client.live).toBe(true);
    const days = await client.fetchSlots(TZ, NOW);
    expect(days.map((d) => d.date)).toEqual(["2026-09-24", "2026-09-25"]);
    expect(days[0]?.starts.length).toBe(2);
    const { url, init } = f.calls[0] as Call;
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://api.cal.com/v2/slots");
    expect(u.searchParams.get("username")).toBe("revenue-os");
    expect(u.searchParams.get("eventTypeSlug")).toBe("demo");
    expect(u.searchParams.get("timeZone")).toBe(TZ);
    expect(u.searchParams.get("start")).toBe(NOW.toISOString());
    expect(header(init, "cal-api-version")).toBe("2024-09-04");
  });

  test("fetchSlots rejects a malformed response", async () => {
    const client = createBookingClient({
      ...config,
      fetch: fakeFetch(200, { status: "success", data: "nope" }),
    });
    await expect(client.fetchSlots(TZ, NOW)).rejects.toBeInstanceOf(
      BookingError,
    );
  });

  test("createBooking posts the documented booking shape", async () => {
    const f = fakeFetch(201, {
      status: "success",
      data: { uid: "abc", start: "2026-09-25T05:30:00.000Z" },
    });
    const client = createBookingClient({ ...config, fetch: f });
    const res = await client.createBooking({
      start: "2026-09-25T11:00:00.000+05:30",
      name: "Rohan Mehta",
      email: "rohan@meridian.in",
      company: "Meridian Homes",
      phone: "+919876543210",
      timeZone: TZ,
      source: "hero",
    });
    expect(res).toEqual({ uid: "abc", start: "2026-09-25T05:30:00.000Z" });
    const { url, init } = f.calls[0] as Call;
    expect(url).toBe("https://api.cal.com/v2/bookings");
    expect(init.method).toBe("POST");
    expect(header(init, "cal-api-version")).toBe("2026-02-25");
    expect(JSON.parse(String(init.body))).toEqual({
      start: "2026-09-25T05:30:00.000Z",
      username: "revenue-os",
      eventTypeSlug: "demo",
      attendee: {
        name: "Rohan Mehta",
        email: "rohan@meridian.in",
        timeZone: TZ,
        language: "en",
        phoneNumber: "+919876543210",
      },
      bookingFieldsResponses: { company: "Meridian Homes" },
      metadata: { source: "hero" },
    });
  });

  test("createBooking leaves phone out when none is given", async () => {
    const f = fakeFetch(201, {
      status: "success",
      data: { uid: "abc", start: "2026-09-25T05:30:00.000Z" },
    });
    await createBookingClient({ ...config, fetch: f }).createBooking({
      start: "2026-09-25T05:30:00.000Z",
      name: "A",
      email: "a@b.co",
      company: "C",
      timeZone: TZ,
      source: "nav",
    });
    expect(
      JSON.parse(String((f.calls[0] as Call).init.body)).attendee.phoneNumber,
    ).toBeUndefined();
  });

  const FAILURES: Array<[string, typeof fetch, string]> = [
    [
      "a taken slot",
      fakeFetch(400, {
        status: "error",
        error: {
          message:
            "User either already has booking at this time or is not available",
        },
      }),
      "unavailable",
    ],
    [
      "a server error",
      fakeFetch(500, { status: "error", error: { message: "boom" } }),
      "server",
    ],
    [
      "a start time in the past",
      fakeFetch(400, {
        status: "error",
        error: { message: "Attempting to book a meeting in the past." },
      }),
      "unavailable",
    ],

    [
      "a start time outside the booking window",
      fakeFetch(400, {
        status: "error",
        error: {
          message: 'This event type can\'t be booked at the "start" time',
        },
      }),
      "unavailable",
    ],

    [
      "a network failure",
      (async () => {
        throw new TypeError("offline");
      }) as unknown as typeof fetch,
      "network",
    ],
  ];
  for (const [label, f, kind] of FAILURES) {
    test(`createBooking maps ${label} to "${kind}"`, async () => {
      const err = await createBookingClient({ ...config, fetch: f })
        .createBooking({
          start: "2026-09-25T05:30:00.000Z",
          name: "A",
          email: "a@b.co",
          company: "C",
          timeZone: TZ,
          source: "nav",
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BookingError);
      expect((err as BookingError).kind).toBe(kind as BookingError["kind"]);
    });
  }
});

describe("form helpers", () => {
  const PHONES: Array<[string, string | null]> = [
    ["98765 43210", "+919876543210"],
    ["+91 98765-43210", "+919876543210"],
    ["098765 43210", "+919876543210"],
    ["+1 415 555 0123", "+14155550123"],
    ["58765 43210", "+915876543210"], // a 10-digit STD landline is valid
    ["022 2345 6789", "+912223456789"],
    ["+91 12345", null],
    ["+91 98765 4321", null],
    ["12345", null],
    ["", null],
  ];
  for (const [raw, want] of PHONES) {
    test(`normalisePhone(${JSON.stringify(raw)}) → ${want}`, () =>
      expect(normalisePhone(raw)).toBe(want));
  }

  test("outside India a local number needs its country code", () => {
    expect(normalisePhone("07700 900123", false)).toBe(null);

    expect(normalisePhone("+44 7700 900123", false)).toBe("+447700900123");

    expect(normalisePhone("98765 43210", false)).toBe(null);
  });

  test("isEmail accepts a work address and rejects junk", () => {
    expect(isEmail("rohan@meridian.in")).toBe(true);
    expect(isEmail(" rohan@meridian.co.in ")).toBe(true);
    for (const bad of ["rohan", "rohan@", "rohan@meridian", "a b@c.in"])
      expect(isEmail(bad)).toBe(false);
  });
});

describe("analytics", () => {
  const g = globalThis as { window?: unknown; document?: unknown };
  afterEach(() => {
    delete g.window;
    delete g.document;
  });

  test("track() sends the event with its props to Plausible when loaded", () => {
    const sent: unknown[][] = [];
    g.window = { plausible: (...a: unknown[]) => sent.push(a) };
    track("Demo click", { source: "hero" });
    expect(sent).toEqual([["Demo click", { props: { source: "hero" } }]]);
  });

  test("track() is a safe no-op without Plausible or a window", () => {
    expect(() => track("Booking start", { source: "nav" })).not.toThrow();
    g.window = {};
    expect(() => track("Booking start", { source: "nav" })).not.toThrow();
  });

  test("a sample play is remembered for the booking event", () => {
    track("Sample play", { source: "hero-link" });
    expect(hasHeardSample()).toBe(true);
  });

  test("initAnalytics loads only an https script, and queues early events", () => {
    const appended: Array<{ src: string; async: boolean }> = [];
    g.window = {};
    g.document = {
      createElement: () => ({ src: "", async: false }),
      head: {
        append: (s: { src: string; async: boolean }) => appended.push(s),
      },
    };
    initAnalytics("http://plausible.io/js/pa-x.js");
    initAnalytics("not a url");
    expect(appended.length).toBe(0);
    initAnalytics("https://plausible.io/js/pa-x.js");
    expect(appended).toEqual([
      { src: "https://plausible.io/js/pa-x.js", async: true },
    ]);
    track("Demo click", { source: "nav" });
    const w = g.window as { plausible?: { q?: unknown[][] } };
    expect(w.plausible?.q).toEqual([
      ["Demo click", { props: { source: "nav" } }],
    ]);
  });
});
