# apps/www — marketing landing page

The **marketing surface** of the two-surface Revenue OS design system (the other
surface is the product console). A small **React + Vite + Tailwind v4** app — the
console's exact stack — that composes reusable design elements and typed content
into the landing page. It is **zero-dependency in the runtime sense**: the shipped
site makes no backend/API calls and holds no secrets. Build tooling
(react + vite + tailwind) is allowed and shared with the console — those deps are
already approved in `docs/tech-stack.md` §T24, so componentizing added **no new
repo dependency**.

## Commands

```bash
bun install          # once, from the repo root (installs the shared workspace deps)
bun run --filter www dev       # vite dev server
bun run --filter www build     # production build → apps/www/dist
bun run --filter www preview   # serve the built dist locally
```

## Layout

| Path | What it holds |
| --- | --- |
| `index.html` | The Vite entry: a `#root` div + `<script type="module" src="/src/main.tsx">`, plus the head meta (description, Open Graph, `theme-color`, `color-scheme: only light` so forced-dark browsers leave the page alone) and the favicon link. |
| `public/` | Static files served as-is — `favicon.svg` (the brand mark). |
| `src/main.tsx` | Boot entry — mounts `<App/>` into `#root` and owns the single stylesheet side-effect `import "./styles.css"` (so `App` stays SSR-safe). |
| `src/App.tsx` | Composes the page: skip link, sticky `header → nav`, `main` → the sections, `footer` → the meta row. Calls `useReveal()` once and honours a cold-load deep link (`/#pricing`). Imports no CSS. |
| `src/styles.css` | `@import "tailwindcss"` + the `@theme` tokens (paper / ink / clay palette, illustration plates, the `card` surface, the `lift` shadow, type families, the soft ease), the `ro-*` keyframes, the scroll-reveal, pause, and reduced-motion rules, the decorative `@utility` classes (`bg-grain`, `mask-fade-x`), and **every** `@font-face` block. The **only** place raw colour hex lives. |
| `src/design/` | Reusable, tokens-only elements — `Heading` (display / section / card scale, `balance`), `Text` (lede / body / small sizes; default / muted / inverse tones), `Kicker` (section / hero / inverse / clay eyebrows), `MonoLabel`, `CtaButton` (accent / ghost pills), `SectionFrame` (plain paper; wash / ink / clay inset panels; `flush`). All take `ref`, so `reveal()` spreads onto them. Named exports; no copy, no raw hex. |
| `src/sections/` | One file per section — `Nav`, `Hero`, `Logos`, `StageGrid` (the dark "how it works" panel; hosts `FunnelFlow` and `IntentRouting`), `IntentRouting`, `Moats`, `Pricing`, `Faq`, `FooterCta`. Each composes `design/` elements and imports its copy from `content/`. |
| `src/visuals/` | The animated set pieces — `BrandMark` (the logo mark), `HeroCall` (the looping demo call: a lead is rung, qualified in Hinglish, scored, and either booked or sent to the nurture loop), `FunnelFlow` (lead dots running the four stages and splitting by intent), `MoatArt` (line illustrations), `CallArt` (the closing panel's poster mark), `Icon` (the 16px line glyphs). SVG + CSS keyframes / SMIL; no animation library. |
| `src/content/` | Typed data modules (`site`, `hero`, `stages`, `moats`, `plans`, `faqs`, `logos`, `cta`) holding the copy as `as const` / interfaces. Sections and visuals import these and **inline nothing** — the separation the architecture suite pins. |
| `src/lib/` | `cx.ts` (the one-line className joiner, mirroring the console's `ui/cx.ts`), `reveal.ts` (`reveal(delayMs)` props + `useReveal()`), and `motion.ts` (the page-wide pause switch `useStill()` / `setStill()`, and `useLiveSvg()`, which runs an SVG's animations only while it is on screen and not paused). |
| `fonts/` | Self-hosted `.woff2` subsets (Lora 400 + italic, IBM Plex Mono 400). Referenced from `src/styles.css` as `../fonts/<file>.woff2`. |
| `test/` | The spec. `copy-parity.test.tsx` renders `<App/>` to static markup and pins load-bearing copy, the default UI state, and the accessible shape of the animated visuals; `architecture.test.ts` pins the file layout / exports / content separation / tokens / motion floor; `build.test.ts` proves `vite build` bundles the tree. |

## Design language

Editorial and calm, in the spirit of Anthropic's design team: warm paper, ink,
and **one** clay accent; generous whitespace; hairlines and soft paper-2 fills
instead of boxes, gradients, or glows.

- **Palette** — `paper` ground, `paper-2` cards and bands, `line` hairlines,
  `ink` / `ink-2` / `stone` text tiers, `clay` the accent (with `clay-deep` for
  small text on paper), `olive` for low intent / nurture (`olive-deep` for small
  text), plus illustration plates (`oat`, `cactus`, `heather`) and the `card`
  surface.
  Alpha tiers are Tailwind `/<alpha>` modifiers on these tokens.
- **Type** — Lora 400 for display and card titles (sentence case, tight
  tracking, balanced); the platform's own UI sans for body, buttons and nav (no
  font file, no request); IBM Plex Mono only for machine data — timestamps,
  scores, stage numbers, tiny tracked-caps labels.
- **Rhythm** — sections sit in a centred 1200px column; three inset rounded
  panels pace the paper page: the dark ink panel (how it works), the paper-2
  panel (pricing), and the clay panel (the closing offer).

## Editing rules

- **Colours and fonts change in `src/styles.css` `@theme` and nowhere else.** It
  owns the only raw hex; components reference tokens through generated
  utilities (`bg-paper`, `text-ink`, `border-line`, `text-clay-deep`, `bg-ink/5`
  …). A raw hex in any `src/**/*.{ts,tsx}` fails `test/architecture.test.ts`.
  Small text keeps ≥ 4.5:1 contrast on its background — use the `-deep` variants
  or `stone`, never `clay` / `olive` / `mute` as small text on paper.
- **Copy lives in `src/content/`.** A section or visual imports its strings, never
  inlines them — the separation guard fails otherwise. Copy edits keep the
  copy-parity anchors green in the same change.
- **Reusable look lives in `src/design/`.** A section composes these elements; it
  does not re-declare typography or button skins. `cx()` does not dedupe Tailwind
  utilities, so never pass a class that fights a primitive's own — use the
  primitive's props (`size`, `tone`, `balance`, `flush`) instead. Tailwind's
  preflight already zeroes margins, paddings and list styles.
- **Responsive** is mobile-first (`md:` 768, `lg:` 1024) and must hold from 360px
  up with no horizontal scroll. Keyboard focus draws a clay-deep `:focus-visible`
  ring (ink on the clay panel); `scroll-padding-top` keeps anchors, focus and the
  skip link clear of the sticky nav.
- **Interactivity** (plan select, FAQ accordion) is React `useState`; its default
  is what SSR emits and the copy-parity suite pins (funnel selected, FAQ item 0
  open), exposed via the `data-plan` / `data-selected` / `data-faq` /
  `data-open` hooks.

## Motion rules

Motion explains the product — the demo call, the lead flow, the loops — and never
decorates for its own sake.

- **CSS first.** Keyframes (`ro-rise`, `ro-ring`, `ro-wave`, `ro-draw`,
  `ro-marquee` …) live in `src/styles.css`; components apply them with Tailwind
  arbitrary animations. SVG loops may use SMIL.
- **Scroll reveal** — spread `{...reveal(delayMs)}` on a block for a one-shot
  fade-and-rise. Content is only hidden once `useReveal()` has opted the document
  in (`html[data-motion]`), so a failed script never hides anything.
- **Everything can be paused.** The hero's "Pause animations" switch sets
  `html[data-still]`: CSS keyframes freeze, SVGs pause through `useLiveSvg()`,
  and the demo call holds its place (WCAG 2.2.2). Off-screen SVGs pause too.
- **Reduced motion is the floor.** Under `prefers-reduced-motion: reduce` every
  keyframe and transition ends immediately, SMIL groups marked `data-motion-only`
  are removed, and JS sequences (the demo call) render their final static state.
- **SSR-safe and accessible.** No `window` / `document` at render or module scope;
  timers and observers are cleaned up and pause off-screen. Decorative visuals are
  `aria-hidden`; the demo call is a single `role="img"` with a text alternative —
  never a stream of live updates.

## Adding a page (future contact-us)

The next surface (e.g. a `/contact-us`) is a new entry, not a rewrite:

1. Add its copy as a typed module under `src/content/`.
2. Build its sections under `src/sections/`, composing `src/design/` elements — no
   new colours outside `@theme`, no inlined copy.
3. Give it an entry `contact.html` + `src/contact.tsx` (mirroring `index.html` /
   `main.tsx`) and register it as a Vite `build.rollupOptions.input` so `vite build`
   emits both pages. Keep it a static, backend-free surface.

## Self-hosted fonts (rationale)

Fonts are shipped as local `.woff2` subsets under `fonts/` and declared as
`@font-face` in `src/styles.css` — **never** fetched from a CDN. This keeps the
surface self-contained (no third-party font host, no external request on load, no
privacy leak), which the architecture suite enforces: every `@font-face` `url()`
must resolve to a local `../fonts/` file and no external `http(s)` host may appear
anywhere in `src/`. The UI sans is the platform's own system font, so it needs no
file at all.

## Visual source of truth

Machine tests pin copy, token values, default state, and the motion floor — not
pixels. The editorial redesign (2026-09-23, Anthropic-inspired: paper / ink /
clay) **supersedes** the dark-green-and-gold export from the "Revenue OS Design
System" project on claude.ai (Marketing group); until that project is updated to
match, this app and the rules above are the reference.
