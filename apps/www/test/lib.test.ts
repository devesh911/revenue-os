// Unit spec for the booking client (Cal.com v2 + the preview adapter), the
// analytics hook, the step-by-step loop runner (lib/sequence: its first paint, and
// when it starts playing) and the message chime with its sound switch (lib/chime).
// fetch, IntersectionObserver and Web Audio are stand-ins, so nothing leaves the
// machine and nothing plays; the request shapes pinned here are the ones Cal.com's
// public API documents.
import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { createElement, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hasHeardSample, initAnalytics, track } from "../src/lib/analytics";
import {
  BookingError,
  createBookingClient,
  dateIn,
  isEmail,
  normalisePhone,
  previewSlots,
} from "../src/lib/booking";
import { useSequence } from "../src/lib/sequence";

const NOW = new Date("2026-09-23T05:00:00Z"); // Wed 10:30 IST
const TZ = "Asia/Kolkata";

// bun test has no DOM to mount a component in, so a hook runs under a stand-in for
// React's hook dispatcher that answers the hooks it calls and records what they are
// handed (react is pinned to an exact version, so these internals hold still).
function withHooks<T>(hooks: object, run: () => T): T {
  const internals = (
    React as unknown as {
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: {
        H: unknown;
      };
    }
  ).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const prev = internals.H;
  internals.H = hooks;
  try {
    return run();
  } finally {
    internals.H = prev;
  }
}

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

describe("useSequence — what the first paint shows, and when it plays", () => {
  const g = globalThis as {
    window?: unknown;
    document?: unknown;
    IntersectionObserver?: unknown;
  };
  afterEach(() => {
    delete g.window;
    delete g.document;
    delete g.IntersectionObserver;
  });

  // A three-step visual that prints the runner's state as its text.
  function Probe() {
    const ref = useRef<HTMLDivElement>(null);
    const { step, resetting, playing } = useSequence(ref, [0, 600, 1500], 2000);
    return createElement("div", { ref }, `${step} ${resetting} ${playing}`);
  }
  const paint = () =>
    renderToStaticMarkup(createElement(Probe)).replace(/<[^>]+>/g, "");
  const browser = (observer: boolean, reduce: boolean) => ({
    ...(observer && { IntersectionObserver: class {} }),
    matchMedia: (q: string) => ({ matches: reduce && q.includes("reduce") }),
  });

  test("the server render is the final step, standing still", () => {
    expect(paint()).toBe("2 false false");
  });

  test("without IntersectionObserver: the final step, standing still", () => {
    g.window = browser(false, false);
    expect(paint()).toBe("2 false false");
  });

  test("under reduced motion: the final step, standing still", () => {
    g.window = browser(true, true);
    expect(paint()).toBe("2 false false");
  });

  test("with motion it starts from step 0 and waits, not playing, until seen", () => {
    g.window = browser(true, false);
    expect(paint()).toBe("0 false false");
  });

  test("paused before it ever played: it jumps to the final step, not an empty frame", () => {
    g.window = browser(true, false);
    const sets: unknown[] = [];
    const effects: Array<() => unknown> = [];
    withHooks(
      {
        useState: (init: unknown) => [
          typeof init === "function" ? init() : init,
          (v: unknown) => sets.push(v),
        ],
        useEffect: (fn: () => unknown) => effects.push(fn),
        useRef: (v: unknown) => ({ current: v }),
        useSyncExternalStore: () => true, // the page-wide Pause switch is on
      },
      () => useSequence({ current: null }, [0, 600, 1500], 2000),
    );
    for (const fn of effects) fn();
    expect(sets).toContain(2);
  });

  // Its effects run by hand under a stand-in observer, in a viewport 800px tall:
  // what the runner sets when one entry arrives with `ratio` of the stage on screen,
  // covering `share` of the viewport — and the thresholds it asked to hear at.
  function verdict(ratio: number, share: number, hidden = false) {
    let report: (entries: unknown[]) => void = () => {};
    let thresholds: number[] = [];
    class Observer {
      constructor(fn: typeof report, opts: { threshold: number[] }) {
        report = fn;
        thresholds = opts.threshold;
      }
      observe() {}
      disconnect() {}
    }
    g.window = {
      ...browser(true, false),
      IntersectionObserver: Observer,
      innerHeight: 800,
    };
    g.IntersectionObserver = Observer;
    g.document = { hidden, addEventListener() {}, removeEventListener() {} };
    const sets: unknown[] = [];
    const effects: Array<() => unknown> = [];
    withHooks(
      {
        useState: (init: unknown) => [
          typeof init === "function" ? init() : init,
          (v: unknown) => sets.push(v),
        ],
        useEffect: (fn: () => unknown) => effects.push(fn),
        useRef: (v: unknown) => ({ current: v }),
        useSyncExternalStore: (
          _s: unknown,
          _g: unknown,
          server: () => unknown,
        ) => server(),
      },
      () => useSequence({ current: {} as HTMLElement }, [0, 600, 1500], 2000),
    );
    for (const fn of effects) fn();
    sets.length = 0;
    report([
      {
        intersectionRatio: ratio,
        intersectionRect: { height: share * 800 },
        rootBounds: { height: 800 },
      },
    ]);
    return { sets, thresholds };
  }

  test("it plays once a third is on screen, or once a stage too tall for that fills the view", () => {
    expect(verdict(0.35, 0.35).sets, "a third on screen").toEqual([true]);
    // 3.5 screens tall (a landscape phone, a zoomed page): filling 70% of the
    // view is only 0.2 of the stage, and it can never reach a third
    expect(verdict(0.2, 0.7).sets, "a tall stage filling the view").toEqual([
      true,
    ]);
    expect(verdict(0.1, 0.3).sets, "a sliver").toEqual([false]);
    expect(verdict(1, 1, true).sets, "in a hidden tab").toEqual([false]);
    // a stage five screens tall (400% zoom) shows at most 0.2 of itself, so the
    // observer must report below that for the rule above to ever run
    const { thresholds } = verdict(0, 0);
    expect(thresholds.some((t) => t > 0 && t <= 0.2)).toBe(true);
    // For a stage 1/r screens tall, the observer must report somewhere between it
    // filling 60% of the view (a share of 0.6r) and filling it (r) — for every r
    // down to a stage over 30 screens tall.
    for (let r = 0.03; r <= 0.35; r += 0.01) {
      expect(
        thresholds.some((t) => t >= 0.6 * r && t < r),
        `a report between ${(0.6 * r).toFixed(3)} and ${r.toFixed(2)}`,
      ).toBe(true);
    }
  });
});

describe("chime — the message chime and its sound switch", () => {
  const g = globalThis as {
    window?: unknown;
    AudioContext?: unknown;
    localStorage?: unknown;
  };
  afterEach(() => {
    delete g.window;
    delete g.AudioContext;
    delete g.localStorage;
  });

  // Each load is a fresh copy of the module, as on a new page load.
  let loads = 0;
  const load = () =>
    import(`../src/lib/chime.ts?load=${++loads}`) as Promise<
      typeof import("../src/lib/chime")
    >;

  // A Web Audio stand-in: records the pitch of each note as it starts.
  class FakeAudio {
    static made: FakeAudio[] = [];
    static allow = true; // false: the browser refuses to start audio (not a real gesture)
    state = "suspended";
    currentTime = 0;
    destination = {};
    notes: number[] = [];
    constructor() {
      FakeAudio.made.push(this);
    }
    resume() {
      if (FakeAudio.allow) this.state = "running";
      return Promise.resolve();
    }
    createGain() {
      const ramp = () => {};
      return {
        gain: {
          value: 1,
          setValueAtTime: ramp,
          exponentialRampToValueAtTime: ramp,
        },
        connect: <T>(node: T) => node,
      };
    }
    createOscillator() {
      const osc = {
        type: "",
        frequency: { value: 0 },
        connect: <T>(node: T) => node,
        start: () => this.notes.push(osc.frequency.value),
        stop: () => {},
      };
      return osc;
    }
  }

  // A browser with Web Audio; returns the listeners armChime() registers, so a
  // test can fire the visitor's first gesture by hand.
  let removed: string[] = [];
  const GESTURES = ["pointerdown", "pointerup", "click", "touchend", "keydown"];
  function browser() {
    const listeners: Array<{ type: string; fn: () => void; opts: unknown }> =
      [];
    FakeAudio.made = [];
    FakeAudio.allow = true;
    removed = [];
    g.AudioContext = FakeAudio;
    g.window = {
      AudioContext: FakeAudio,
      addEventListener: (type: string, fn: () => void, opts: unknown) =>
        listeners.push({ type, fn, opts }),
      removeEventListener: (type: string) => removed.push(type),
    };
    return listeners;
  }

  // useSound() and useSoundReady() are thin useSyncExternalStores: capture the
  // store each reads, which is what React's renderer would subscribe to.
  type Store = {
    subscribe: (fn: () => void) => () => void;
    get: () => boolean;
  };
  function storeOf(hook: () => unknown): Store {
    let store: Store | undefined;
    withHooks(
      {
        useSyncExternalStore: (
          subscribe: Store["subscribe"],
          get: Store["get"],
        ) => {
          store = { subscribe, get };
          return get();
        },
      },
      hook,
    );
    if (!store) throw new Error("the hook read no store");
    return store;
  }

  const TWO_NOTES = [880, 1318.5]; // A5, then E6

  test("stays silent until a real tap, click or key press unlocks audio; a scroll doesn't use it up", async () => {
    const listeners = browser();
    const m = await load();
    m.chime();
    m.armChime();
    expect(listeners.map((l) => [l.type, l.opts])).toEqual(
      GESTURES.map((type) => [type, true]),
    );
    m.chime();
    expect(FakeAudio.made.length, "no audio before a gesture").toBe(0);
    // the Sound switch reads "on" only once audio can play, and hears when it can
    const ready = storeOf(m.useSoundReady);
    let heard = 0;
    ready.subscribe(() => heard++);
    expect(ready.get(), "off before a gesture").toBe(false);

    // A phone visit usually starts with a scroll: the touch fires, but the browser
    // refuses to start audio. The listeners must stay armed for the next real tap.
    FakeAudio.allow = false;
    listeners[0]?.fn();
    await Promise.resolve();
    const audio = FakeAudio.made[0] as FakeAudio;
    expect(audio.state).toBe("suspended");
    expect(removed, "still listening after a refused start").toEqual([]);
    expect(ready.get(), "still off after a refused start").toBe(false);
    m.chime();
    expect(audio.notes).toEqual([]);

    FakeAudio.allow = true; // then a real tap
    listeners[2]?.fn();
    await Promise.resolve();
    expect(FakeAudio.made.length, "one context, reused").toBe(1);
    expect(audio.state).toBe("running");
    expect([...removed].sort(), "disarmed once running").toEqual(
      [...GESTURES].sort(),
    );
    expect(ready.get(), "on once running").toBe(true);
    expect(heard, "the switch re-renders when it starts").toBe(1);
    m.chime();
    expect(audio.notes).toEqual(TWO_NOTES);

    audio.state = "suspended"; // the browser suspended it again
    m.chime();
    expect(audio.notes).toEqual(TWO_NOTES);
  });

  test("the Sound switch's own press unlocks audio: it is a real gesture", async () => {
    browser();
    const m = await load();
    const ready = storeOf(m.useSoundReady);
    m.unlockSound();
    await Promise.resolve();
    expect(ready.get()).toBe(true);
    m.chime();
    expect((FakeAudio.made[0] as FakeAudio).notes).toEqual(TWO_NOTES);
  });

  test("stays silent while sound is switched off, and plays once it is back on", async () => {
    const listeners = browser();
    const m = await load();
    m.armChime();
    listeners[0]?.fn();
    const audio = FakeAudio.made[0] as FakeAudio;
    m.setSound(false);
    m.chime();
    expect(audio.notes).toEqual([]);
    m.setSound(true);
    m.chime();
    expect(audio.notes).toEqual(TWO_NOTES);
  });

  test("without Web Audio (or a window) arming and chiming are safe no-ops", async () => {
    const m = await load();
    expect(() => {
      m.armChime();
      m.unlockSound();
      m.chime();
    }).not.toThrow();
    const listeners: string[] = [];
    g.window = { addEventListener: (type: string) => listeners.push(type) };
    m.armChime();
    expect(listeners).toEqual([]);
  });

  test("setSound remembers the choice in this browser; the next load reads it", async () => {
    const saved = new Map<string, string>();
    g.localStorage = {
      getItem: (k: string) => saved.get(k) ?? null,
      setItem: (k: string, v: string) => void saved.set(k, v),
    };
    const m = await load();
    expect(storeOf(m.useSound).get(), "sound defaults to on").toBe(true);
    m.setSound(false);
    expect(saved.get("ro-sound")).toBe("off");
    expect(storeOf((await load()).useSound).get()).toBe(false);
    m.setSound(true);
    expect(saved.get("ro-sound")).toBe("on");
    expect(storeOf((await load()).useSound).get()).toBe(true);
  });

  test("with storage blocked (a private window) the switch still works for the page", async () => {
    const blocked = () => {
      throw new Error("storage blocked");
    };
    g.localStorage = { getItem: blocked, setItem: blocked };
    const m = await load();
    const store = storeOf(m.useSound);
    expect(store.get()).toBe(true);
    expect(() => m.setSound(false)).not.toThrow();
    expect(store.get()).toBe(false);
  });

  test("setSound notifies every subscriber (so the switch re-renders) until it unsubscribes", async () => {
    const m = await load();
    const store = storeOf(m.useSound);
    let heard = 0;
    const unsubscribe = store.subscribe(() => heard++);
    m.setSound(false);
    expect(heard).toBe(1);
    expect(store.get()).toBe(false);
    unsubscribe();
    m.setSound(true);
    expect(heard).toBe(1);
    expect(store.get()).toBe(true);
  });
});
