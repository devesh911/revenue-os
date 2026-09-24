# apps/www — marketing landing page

The **marketing surface** of Revenue OS: a landing page whose one job is to get a
qualified buyer to **book a demo**. A small **React + Vite + Tailwind v4** app (the
console's stack) that composes reusable design elements and typed content into the
page. It has no backend of its own and holds no secrets; it talks to exactly two
outside services, both through public, key-free interfaces:

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
   closing, or `link` for a `/#book` deep link; `Sample play` sends `hero-link`,
   the hero's listen button), `heard_sample` (yes/no on completed bookings),
   `stage` and `kind` (on errors; kind is `unavailable`, `rejected`, `server` or
   `network`).
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
| `index.html` | The Vite entry: a `#root` div + `<script type="module" src="/src/main.tsx">`, plus the head meta (title, description, Open Graph, `theme-color`, `color-scheme: only light` so forced-dark browsers leave the page alone) and the favicon link. The title and description repeat the hero copy — update them together. |
| `public/` | Static files served as-is — `favicon.svg` (the brand mark), `sample-call.m4a` (the synthetic sample call). |
| `scripts/make-sample-call.ts` | Regenerates `public/sample-call.m4a` with the system text-to-speech voices (macOS). Afterwards, set `sampleCall.seconds` in `content/hero.ts` to the new length — the copy-parity suite checks it against the file. |
| `src/main.tsx` | Boot entry — mounts `<App/>` into `#root`, owns the single stylesheet side-effect `import "./styles.css"` (so `App` stays SSR-safe), loads Plausible when configured, and calls `armChime()` so the visitor's first tap, click or key press unlocks the message chime (see **Sound**). |
| `src/App.tsx` | Composes the page inside `BookingProvider`: skip link, sticky `header → nav`, `main` → the sections in page order (see **Page order**): hero · proof · How it works (`HowItWorks`: the intro, 01, 02) · the engine panel (`StageGrid`, 03) · examples · pilot · FAQ · closing, `footer` → the meta row, and the one `BookingDialog`. Calls `useReveal()` once and honours cold-load deep links (`/#pilot`; `/#book` opens the booking dialog). Imports no CSS. |
| `src/styles.css` | `@import "tailwindcss"` + the `@theme` tokens (paper / ink / clay palette, illustration plates, the `card` surface, the `lift` shadow, type families, the soft ease), the shared `ro-*` keyframes, one reserved block per visual for its own keyframes and utilities (`survey-*` for the hero's drawing sheet, `intent-*` for the intent study, `brief-*` for the call brief), the scroll-reveal, pause, and reduced-motion rules, the decorative `@utility` classes, and **every** `@font-face` block. The **only** place raw colour hex lives. |
| `src/design/` | Reusable, tokens-only elements — `Heading` (display / section / card scale, `balance`), `Text` (lede / body / small sizes; default / muted / inverse tones), `Kicker` (section / hero / inverse / clay eyebrows), `MonoLabel`, `CtaButton` (accent / ghost pills; `busy` for a pending submit), `SectionFrame` (plain paper; wash / ink / clay inset panels; `flush`), `DotList` (a dot-separated run). `Heading`, `Text`, `Kicker`, `MonoLabel` and `SectionFrame` take `ref`, so `reveal()` spreads onto them. Named exports; no copy, no raw hex. |
| `src/sections/` | One file per section — `Nav`, `Hero` (the kicker, the headline, the lede, the demo button, the listen button and its note, the pause switch, and the result card on the drawing sheet), `Proof` (the illustrative pilot report), `HowItWorks` (How it works, told as one enquiry: the intro, then "01 · Before the call" over `CallBrief` and "02 · Who to call first" over `IntentEvidence`, each tagged "Illustrative example"), `StageGrid` (the dark engine panel, "03 · The call and after": three steps, each with a small product example; hosts `FunnelFlow` and `IntentRouting`), `IntentRouting` (the follow-up route for buyers not ready to visit), `Moats` (the three examples), `Pricing` (the pilot, how fees work, and the "Compare plans" disclosure), `Faq`, `FooterCta` (the clay closing invitation). Each composes `design/` elements and imports its copy from `content/`. |
| `src/visuals/` | `BrandMark` (the logo mark), `SampleAudio` (the hero's listen button: plays the sample recording in place, fetched on the first press), `FunnelFlow` (enquiries running the three steps, the not-yet-ready ones looping through follow-up), `MoatArt` (the example cards' line illustrations), `CallArt` (the closing panel's poster mark), `BookingDialog` (the booking flow), `Icon` (the 16px line glyphs), `SurveyGround` (the hero's drawing sheet, and `SurveyPlan`: the 2 BHK floor plan under the result card, which draws itself once), `IntentEvidence` (why the buyer is high intent: the four signals build his score to 78 and route him to "Call now"), `CallBrief` (the call brief writing itself before the call, with Priya's WhatsApp reply and its chime). SVG + CSS keyframes / SMIL; no animation library. |
| `src/lib/` | `booking.ts` (the Cal.com client + preview adapter + form helpers), `analytics.ts` (`track()`), `bookingContext.tsx` (`BookingProvider`, `useBooking()`, `BookDemoButton`), `reveal.ts` (`reveal(delayMs)` props + `useReveal()`), `motion.ts` (the page-wide pause switch `useStill()` / `setStill()`, and `useLiveSvg()`, which runs an SVG's animations only while it is on screen and not paused), `sequence.ts` (`useSequence()`: steps a looping visual beat by beat while it is on screen), `chime.ts` (the message chime and its remembered sound switch), `cx.ts` (the one-line className joiner). |
| `src/content/` | Every word on the page, as typed modules (`site`, `hero` — including `result`, the hero's card, and `survey`, the drawing sheet's labels — `proof`, `beforeCall` — How it works' intro and chapters 01 and 02 (`howItWorks`, `chapters`) and the four intent signals — `intentEvidence`, `callBrief`, `workflow` — chapter 03, the engine panel — `examples`, `pilot`, `faqs`, `closing`, `booking`). Sections and visuals import these and **inline nothing**. Where the design has a slot the copy doesn't fill (a kicker, a plate word, a diagram label), the fill is taken from the copy around it and lives in the same module. |
| `fonts/` | Self-hosted `.woff2` subsets (Lora 400 + italic, IBM Plex Mono 400). Referenced from `src/styles.css` as `../fonts/<file>.woff2`. |
| `test/` | `copy-parity.test.tsx` (the SSR first paint: copy, one "Book a demo" action, the listen button and its disclosure, the hero's result card word for word and the old call card gone, the drawing sheet and the plan drawn, the page order with each chapter's heading directly above its own visual, chapters 01 and 02 labelled illustrative and showing their studies' final frame, the sound switch, Rohan's one evening told the same everywhere, a score out of 100 only in those two chapters, proof and plans labelled honestly, retired copy stays retired, default UI state and accessibility), `architecture.test.ts` (tokens, fonts, motion floor, pause switch, the plan drawing once, scroll reveal, file layout and page order, content separation, the four intent signals stated once, namespaced keyframes, external hosts, this README), `lib.test.ts` (booking client, analytics, `useSequence`'s first paint, the chime and its sound switch), `build.test.ts` (`vite build`). |

## Design language

Editorial and calm, in the spirit of Anthropic's design team: warm paper, ink,
and **one** clay accent; generous whitespace; hairlines and soft paper-2 fills
instead of boxes, gradients, or glows.

- **Palette** — `paper` ground, `paper-2` cards and bands, `line` hairlines,
  `ink` / `ink-2` / `stone` text tiers, `clay` the accent (with `clay-deep` for
  small text on paper), `olive` for follow-up / not yet ready (`olive-deep` for
  small text), plus illustration plates (`oat`, `cactus`, `heather`) and the
  `card` surface. Alpha tiers are Tailwind `/<alpha>` modifiers on these tokens.
- **Type** — Lora 400 for display and card titles (sentence case, tight
  tracking, balanced); the platform's own UI sans for body, buttons and nav (no
  font file, no request); IBM Plex Mono only for machine data — timestamps,
  durations, step numbers, tiny tracked-caps labels.
- **Rhythm** — sections sit in a centred 1200px column; three inset rounded
  panels pace the paper page: the dark ink panel (How it works' chapter 03, the
  call and after), the paper-2 panel (the pilot), and the clay panel (the closing
  invitation).

## Page order

The page follows one enquiry — Rohan Mehta's, one evening — from the headline to
the booking, and tells each step once, in the order it happens. As a visitor
scrolls:

1. **Hero** (`sections/Hero.tsx`) — the promise, "Book a demo", the sample call,
   and one finished result: Rohan called 2 min after import, a site visit booked.
2. **Proof** (`sections/Proof.tsx`) — what a pilot report shows (illustrative).
3. **How it works** (`sections/HowItWorks.tsx`, `#how`, the nav's "How it
   works") — the intro "Follow one enquiry, from import to site visit.", then:
   - **01 · Before the call** — "Your team answers once. Every call knows.",
     directly above the call brief that shows it (`CallBrief`);
   - **02 · Who to call first** — "Every score shows its working.", directly
     above the intent evidence that shows it (`IntentEvidence`).
4. **03 · The call and after** (`sections/StageGrid.tsx`, `#the-call`) — the dark
   engine panel, "The call, then the next step": the three steps and the follow-up
   route.
5. **Examples**, **Pilot**, **FAQ**, then the **closing** invitation.

Each chapter's heading sits directly above its own visual, with nothing between
but its one-line explanation, so a message never arrives before or after the
picture that proves it. `App.tsx` composes the sections in this order and the
copy-parity suite pins it, heading by heading.

## The hero

The hero follows study A3 ("Surveyor's grid") from the hook-studies board. The
copy column holds the kicker, the page's one headline, the lede, "Book a demo",
"Hear a sample call 0:42" with its text-to-speech note, and under that the
page-wide **Pause animations** switch (a real button, 44px touch target; hidden
under reduced motion, where there is nothing to pause).

Beside it, an architect's drawing sheet (`visuals/SurveyGround.tsx`): graph paper
that clears behind the copy, on a slightly darker margin that also runs up behind
the see-through nav, registration marks at the corners, and a title strip in the
bottom margin — north point, "Meridian Greens · Tower B · Typical 2 BHK",
"Illustrative". On it lies the floor plan of that flat (`SurveyPlan`): walls,
windows, the sliding balcony door, three door swings (the only clay), and the
9.75 m width dimensioned above it — no room names. The plan draws itself **once**,
the first time it comes on screen (a slow wipe, then the width and the swings),
and then stays still; pressing Pause mid-drawing finishes it at once, and the
server render and reduced motion show it drawn. The sheet and the plan are
decorative (`aria-hidden`).

On the plan sits the **result card**, tilted, as in the study: "Rohan Mehta" ·
"Called 2 min after import" / "Captured" / "₹90 L", "2 BHK · Whitefield",
"Within 12 months" / "Site visit booked · Sat 11:00 AM". Its words live in
`content/hero.ts` as `result`. It is an illustration of one call's outcome, not a
live call: to a screen reader it is one image (`role="img"`) whose label says so
and tells the call in words that read aloud well. From 1024px the plan takes a
fixed right-hand column and the copy centres beside it; between 640px and 1023px
the plan and card sit centred under the copy; below 640px the plan is hidden and
the card follows the copy.

The earlier looping call card (two buyers, a live transcript, a readiness gauge,
and room labels on the plan lighting up as the call went) has been removed; the
test suites keep it gone.

## How it works

`sections/HowItWorks.tsx` tells chapters 01 and 02; the engine panel after it is
chapter 03. Chapters 01 and 02 each carry a visible **"Illustrative example"**
tag, because intent scoring and questions to the sales team are planned, not
built.

1. **01 · Before the call** — "Your team answers once. Every call knows." The call
   brief (`visuals/CallBrief.tsx`) writes itself, each fact with where it came
   from. The one question the brochure can't answer goes to Priya Nair in sales;
   her WhatsApp reply pops up in front of the brief (with the chime), then settles
   into the row and the project's saved facts. The rail adds up the four signals
   under "Intent signals", the bar filling from zero to 78 and turning from clay
   to olive, then the call plan writes itself and the call starts.
2. **02 · Who to call first** — "Every score shows its working." The intent
   evidence (`visuals/IntentEvidence.tsx`): four signals land one at a time with
   their weights, the score climbs past the call-now line to 78 / 100, the home
   loan lands as context (no weight), and the router lights "Call now" while the
   follow-up plan stays dim.

The intro and both chapters' words live in `content/beforeCall.ts` (`howItWorks`,
`chapters`), as do the four signals and their weights (`intentSignals`, with
`intentScore` summing them); both studies and their copy modules read them from
there and restate no number — the architecture suite fails if they do. Both are
driven by `useSequence()` (see **Motion rules**), so the server render and reduced
motion show the finished frame: all four signals, 78 / 100, "Call now", the saved
answer, the plan and "Ready". Screen readers get each study once: the intent study
is one labelled image, the brief has a visually hidden summary that includes
Priya's reply. Chapter 03's words live in `content/workflow.ts`.

## Sound (the message chime)

When Priya's reply pops up, the brief plays a soft two-note chime, synthesised
with Web Audio in `lib/chime.ts` (no audio file). Browsers only allow a page to
play sound after the visitor has interacted with it, so `armChime()` (called once
in `main.tsx`) creates the audio on the first tap, click or key press; until then
`chime()` is silent. The brief carries its own **Sound** switch — a real button
with `aria-pressed`, a 44px touch target — which reads "off" until audio can
actually play (pressing it is itself the gesture that unlocks sound). The choice is
remembered in this browser (`localStorage`, key `ro-sound`; a blocked store just
forgets it). The chime only sounds while the brief is actually playing: never
when it is off screen, paused, or under reduced motion (where the switch is
hidden and the brief stands still).

## Motion rules

Motion explains the product — the plan drawing itself, the lead flow, the two
studies in How it works — and never decorates for its own sake.

- **CSS first.** Keyframes (`ro-rise`, `ro-fade`, `ro-ring`, `ro-wave`,
  `ro-blink`, `ro-draw`, `ro-float` …) live in `src/styles.css`; components apply
  them with Tailwind arbitrary animations. SVG loops may use SMIL. A visual's own
  keyframes take its prefix (`survey-`, `intent-`, `brief-`) and sit in its
  reserved block; the architecture suite checks every animation a component names
  exists.
- **Step-by-step loops use `useSequence()`** (`lib/sequence.ts`): give it when
  each beat starts and how long to hold the end, and it steps the visual only
  while at least a third of it is on screen in a visible tab and the page isn't
  paused (`playing` says so — the chime keys off it). The server render, reduced
  motion and a browser without `IntersectionObserver` get the final beat, so
  nothing on the page depends on it running.
- **Scroll reveal** — spread `{...reveal(delayMs)}` on a block for a one-shot
  fade-and-rise. Content is only hidden once `useReveal()` has opted the document
  in (`html[data-motion]`), so a failed script never hides anything.
- **Everything can be paused.** The "Pause animations" switch in the hero's copy
  column sets `html[data-still]` (WCAG 2.2.2): CSS keyframes freeze, SVGs pause
  through `useLiveSvg()`, `useSequence()` loops hold their beat, and the hero's
  plan finishes its drawing. Off-screen SVGs pause too.
- **Reduced motion is the floor.** Under `prefers-reduced-motion: reduce` every
  keyframe and transition ends immediately, SMIL groups marked `data-motion-only`
  are removed, and JS-driven visuals (the hero's floor plan, the two studies in
  How it works) render their final static state.
- **SSR-safe and accessible.** No `window` / `document` / `Audio` at render or
  module scope; timers and observers are cleaned up and pause off-screen.
  Decorative visuals are `aria-hidden`; the hero's result card and the intent
  study are each a single `role="img"` with a text alternative — never a stream
  of live updates.

## Editing rules

- **Honesty.** Revenue OS has no live customers yet: never present names, logos,
  results or quotes as real. Examples are labelled ("Illustrative example",
  "Example", "Sample call", and the text-to-speech note under the listen button).
  Claims match what exists today: English + Hindi/Hinglish; leads arrive by CSV
  import, so speed reads "called 2 min after import" — never a seconds-to-call
  claim or a lead portal as a live source; CRM connectors and intent scoring are
  planned; no published rates. An intent score out of 100 ("78 / 100") appears
  **only** in How it works' chapters 01 and 02 (`#how`), each of which carries
  "Illustrative example" (intent scoring and questions to the sales team are
  planned, and the routing note says the weights and the line are examples); the
  copy-parity suite fails if a score out of 100 shows anywhere else — the hero,
  the proof, the intro, the engine panel, the examples or the pilot. In the plans a check marks only what is built;
  roadmap items sit under "Planned". Replace the illustrative proof with a real
  project, period, comparison and attributed quote once a pilot has run.
- **Colours and fonts change in `src/styles.css` `@theme` and nowhere else.** It
  owns the only raw hex; components reference tokens through generated
  utilities (`bg-paper`, `text-ink`, `border-line`, `text-clay-deep`, `bg-ink/5`
  …). A raw hex in any `src/**/*.{ts,tsx}` fails the architecture suite. Small
  text keeps ≥ 4.5:1 contrast on its background — use the `-deep` variants or
  `stone`, never `clay` / `olive` / `mute` as small text on paper.
- **Copy lives in `src/content/`.** A section or visual imports its strings, never
  inlines them — the separation guard fails otherwise. "Book a demo" is defined
  once (`content/site.ts`); every primary button is a `BookDemoButton` with its
  analytics `source` (nav, hero, pilot, closing). Copy edits keep the
  copy-parity anchors green in the same change.
- **Reusable look lives in `src/design/`.** A section composes these elements; it
  does not re-declare typography or button skins. `cx()` does not dedupe Tailwind
  utilities, so never pass a class that fights a primitive's own — use the
  primitive's props (`size`, `tone`, `balance`, `flush`) instead.
- **Responsive** is mobile-first (`md:` 768, `lg:` 1024) and must hold from 360px
  up with no horizontal scroll. Keyboard focus draws a clay-deep `:focus-visible`
  ring (ink on the clay panel); `scroll-padding-top` keeps anchors, focus and the
  skip link clear of the sticky nav.
- **Interactivity** (FAQ accordion, "Compare plans", the phone menu, the booking
  dialog) is React `useState`; its default is what SSR emits and the copy-parity
  suite pins (FAQ item 0 open, plans and menu closed, dialog closed), exposed via
  `aria-expanded` and the `data-faq` / `data-open` hooks.
- **The sample call** is a file (`public/sample-call.m4a`) and its length
  (`sampleCall.seconds`), kept together in `content/hero.ts` beside the hero's
  result card (`result`), which tells the same call's outcome; replace them
  together when a real recording exists. **Rohan's evening** is one timeline
  everywhere — imported 7:12 PM, Priya's answer 7:13 PM, called 7:14 PM ("2 min
  after import"), WhatsApp confirmation Thu 7:16 PM, visit Sat 11:00 AM — and the
  copy-parity suite checks every section against it.

## Adding a page (future contact-us)

The next surface (e.g. a `/contact-us`) is a new entry, not a rewrite:

1. Add its copy as a typed module under `src/content/`.
2. Build its sections under `src/sections/`, composing `src/design/` elements — no
   new colours outside `@theme`, no inlined copy.
3. Give it an entry `contact.html` + `src/contact.tsx` (mirroring `index.html` /
   `main.tsx`) and register it as a Vite `build.rollupOptions.input` so `vite build`
   emits both pages. Keep it static; no secrets.

## Self-hosted fonts (rationale)

Fonts are shipped as local `.woff2` subsets under `fonts/` and declared as
`@font-face` in `src/styles.css` — **never** fetched from a CDN. This keeps the
surface self-contained (no third-party font host, no external request on load, no
privacy leak), which the architecture suite enforces: every `@font-face` `url()`
must resolve to a local `../fonts/` file, and the only external host anywhere in
`src/` is the booking API (`https://api.cal.com/`, in `lib/booking.ts`). The UI
sans is the platform's own system font, so it needs no file at all.

## Visual source of truth

Machine tests pin copy, token values, default state, and the motion floor — not
pixels. The editorial redesign (2026-09-23, Anthropic-inspired: paper / ink /
clay) is the reference. A later demo-first redesign was reverted in its favour,
keeping that redesign's copy, booking flow and analytics. It also **supersedes**
the dark-green-and-gold export from the "Revenue OS Design System" project on
claude.ai (Marketing group); until that project is updated to match, this app and
the rules above are the reference.
