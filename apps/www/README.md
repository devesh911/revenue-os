# apps/www — marketing landing page

The **marketing surface** of Revenue OS: a demo-first landing page whose one job is
to get a qualified buyer to **book a demo**. A small **React + Vite + Tailwind v4**
app (the console's stack). It has no backend of its own and holds no secrets; it
talks to exactly two outside services, both through public, key-free interfaces:

- **Cal.com** (public v2 API) — lists open demo times and creates the booking.
- **Plausible** (cookieless analytics) — records the booking funnel.

## Commands

```bash
bun install                    # once, from the repo root
bun run --filter www dev       # vite dev server
bun run --filter www build     # production build → apps/www/dist
bun run --filter www preview   # serve the built dist locally
bun apps/www/scripts/make-sample-call.ts   # regenerate the synthetic sample call (macOS)
```

## Configuration

Set these in the deploy environment (Vite inlines `VITE_*` at build time; none is
a secret):

| Variable | What it is |
| --- | --- |
| `VITE_CALCOM_USERNAME` | The Cal.com username that owns the demo event type. |
| `VITE_CALCOM_EVENT_SLUG` | The demo event type's slug (e.g. `revenue-os-demo`). |
| `VITE_PLAUSIBLE_SRC` | The site-specific Plausible script URL (e.g. `https://plausible.io/js/pa-XXXX.js`). |

**Preview mode.** Without the two Cal.com variables the booking flow still works
end to end on local sample times, but nothing is sent — the dialog says so, and a
production build prints a warning.
Without `VITE_PLAUSIBLE_SRC`, `track()` is a no-op (it logs in development).

### Cal.com setup (once)

1. Create a **30-minute** public event type, e.g. "Revenue OS demo", with a video
   location and the availability you want to offer.
2. Add a booking question with the identifier **`company`** (short text,
   required). Phone uses Cal.com's attendee phone field (optional).
3. Put the username and slug in the variables above. Cal.com sends the
   confirmation email and calendar invite; the page shows its own confirmation.

### Plausible setup (once)

1. Add the site and copy its script URL into `VITE_PLAUSIBLE_SRC`.
2. Create these **custom event goals** — names must match exactly: `Demo click`,
   `Booking start`, `Booking complete`, `Booking error`, `Sample play`.
3. Create the funnel **Demo click → Booking start → Booking complete**.
4. Custom properties sent: `source` (where the booking started: nav, hero, pilot,
   closing, or `link` for a `/#book` deep link), `heard_sample` (yes/no on completed
   bookings), `stage` and `kind` (on errors; kind is `unavailable`, `rejected`,
   `server` or `network`).
5. **Plan:** custom properties and funnels are Plausible Business-plan features. On
   a cheaper plan only the five goal counts are available (no funnel, no split by
   source or `heard_sample`).

### Measuring (how to use the numbers)

Run the page unchanged long enough to get a baseline (a few weeks, or a few
hundred demo clicks), then change **one substantial thing at a time** and
compare against that baseline. Read the funnel, not the clicks: more `Demo click`
with no more `Booking complete` means the booking flow needs work, not the page.
To see whether listening goes with booking, filter the dashboard by the `Sample
play` goal and compare `Booking complete`'s conversion rate with and without that
filter (the `heard_sample` property on each completed booking gives the split).

## Layout

| Path | What it holds |
| --- | --- |
| `index.html` | The Vite entry, head meta (title, description, Open Graph, `theme-color`, `color-scheme: only light`) and the favicon link. The title and description repeat the hero copy — update them together. |
| `public/` | Static files served as-is — `favicon.svg`, `sample-call.m4a` (the synthetic sample call). |
| `scripts/make-sample-call.ts` | Regenerates the synthetic sample call with the system text-to-speech voices and prints its transcript cue times. |
| `src/main.tsx` | Boot entry — mounts `<App/>`, owns the stylesheet import (so `App` stays SSR-safe), and loads Plausible when configured. |
| `src/App.tsx` | Composes the page inside `BookingProvider`: nav · hero · proof · how it works · examples · pilot · FAQ · closing · footer, with the one `BookingDialog`. Honours cold-load deep links (`/#pilot`; `/#book` opens the booking dialog). |
| `src/styles.css` | `@import "tailwindcss"` + the `@theme` tokens, base styles, the one keyframe, the reduced-motion floor, and every `@font-face`. The **only** place raw colour hex lives. |
| `src/design/` | The primitives — `Heading` (the type ranking), `Text`, `Label`, `Button` (one 44px geometry: primary / secondary), `Section` (width + rhythm), `Card` (wash / product). |
| `src/sections/` | One file per section — `Nav`, `Hero`, `Proof`, `HowItWorks`, `Examples`, `Pilot`, `Faq`, `ClosingCta`. |
| `src/visuals/` | `SampleCall` (the player: play/pause, scrubbing, a transcript that follows the audio, the persistent result), `BookingDialog` (the booking flow), `BrandMark`, `Icon`. |
| `src/lib/` | `booking.ts` (the Cal.com client + preview adapter + form helpers), `analytics.ts` (`track()`), `bookingContext.tsx` (`BookingProvider`, `useBooking()`, `BookDemoButton`), `cx.ts`. |
| `src/content/` | Every word on the page, as typed modules (`site`, `hero`, `proof`, `workflow`, `examples`, `pilot`, `faqs`, `closing`, `booking`). Sections and visuals import these and inline nothing. |
| `test/` | `copy-parity.test.tsx` (the SSR first paint: copy, one "Book a demo" action, the sample call readable before playback, retired copy stays retired, accessibility), `architecture.test.ts` (layout, tokens, type ranking, motion discipline, content separation, external hosts), `lib.test.ts` (booking client and analytics), `build.test.ts` (`vite build`). |

## Design system

- **Palette** — `paper` (#F7F6F2) page, `wash` quiet bands and cards, `surface`
  product examples, `line` functional hairlines, `ink` (#191A17) text and primary
  buttons, `ink-2` (#62645E) secondary text, and `clay` terracotta as the one
  accent — used only where it marks meaning (the playing sample, the spoken
  line, the next action, focus). `olive-deep` marks success.
- **Type ranking** — serif (Lora) only for the hero headline and the closing
  statement; the UI sans for section headings (32–40px), cards, controls and
  product information; body 17–18px; labels 13–14px in sentence case; IBM Plex
  Mono only for real timestamps and numbers.
- **Shape and rhythm** — 1160px content width; 88px section spacing on desktop,
  56px on mobile; card corners 12–16px; one button shape (44px, 10px corners).
  No decorative borders, shadows, pills or dots.
- **Motion** — content is visible on first paint; no reveals, loops or
  carousels. The only lasting animation is the "playing" indicator while the
  visitor plays the sample. Reduced motion ends every animation.

## Editing rules

- **Honesty.** Revenue OS has no live customers yet: never present names, logos,
  results or quotes as real. Examples are labelled ("Illustrative example",
  "Example", "Synthetic voices"). Claims match what exists today (English +
  Hindi/Hinglish; CSV lead import; CRM connectors are planned; no published
  rates). Replace the illustrative proof with a real project, period, comparison
  and attributed quote once a pilot has run.
- **Colours and fonts change in `src/styles.css` `@theme` and nowhere else.**
  A raw hex in `src/**/*.{ts,tsx}` fails the architecture suite.
- **Copy lives in `src/content/`.** "Book a demo" is defined once
  (`content/site.ts`); every primary button uses `BookDemoButton`.
- **Look lives in `src/design/`.** Use the primitives' props (`size`, `tone`,
  `variant`, `flush`), not classes that fight them — `cx()` doesn't dedupe.
- **The sample call** is a file, its cue times and its transcript lines, kept
  together in `content/hero.ts`; replace all three when a real recording exists.

## Adding a page (future contact-us)

1. Add its copy as a typed module under `src/content/`.
2. Build its sections under `src/sections/` from `src/design/` primitives.
3. Give it an entry `contact.html` + `src/contact.tsx` and register it in Vite's
   `build.rollupOptions.input`. Keep it static; no secrets.

## Self-hosted fonts

Lora and IBM Plex Mono ship as local `.woff2` subsets under `fonts/`, declared in
`src/styles.css` — never fetched from a CDN. The UI sans is the platform's own
system font. The architecture suite enforces both.
