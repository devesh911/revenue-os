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
| `index.html` | The Vite entry: a `#root` div + `<script type="module" src="/src/main.tsx">`. No copy lives here. |
| `src/main.tsx` | Boot entry — mounts `<App/>` into `#root` and owns the single stylesheet side-effect `import "./styles.css"` (so `App` stays SSR-safe). |
| `src/App.tsx` | Composes the nine sections into the page landmarks (`header → nav`, `main → sections`, `footer → meta`). Imports no CSS. |
| `src/styles.css` | `@import "tailwindcss"` + the `@theme` design tokens (palette, cream-alpha tiers, hairline scale, font families), the decorative `@utility` background layers, and **every** `@font-face` block. The **only** place raw colour hex lives. |
| `src/design/` | Reusable, tokens-only elements — `Heading`, `Text`, `Kicker`, `MonoLabel`, `CtaButton` (accent / ghost), `SectionFrame`. Named exports; no copy, no raw hex. |
| `src/sections/` | One file per section — `Nav`, `Hero`, `Logos`, `StageGrid`, `IntentRouting`, `Moats`, `Pricing`, `Faq`, `FooterCta`. Each composes `design/` elements and imports its copy from `content/`. |
| `src/content/` | Typed data modules (`plans`, `stages`, `faqs`, `moats`, `logos`) holding the copy as `as const` / interfaces. Sections import these and **inline nothing** — the separation the architecture suite pins. |
| `src/lib/cx.ts` | The one-line className joiner (mirrors the console's `ui/cx.ts`). |
| `fonts/` | Self-hosted `.woff2` subsets (Playfair Display, IBM Plex Mono, Lora). Referenced from `src/styles.css` as `../fonts/<file>.woff2`. |
| `test/` | The spec. `copy-parity.test.tsx` renders `<App/>` to static markup and pins load-bearing copy + the default UI state; `architecture.test.ts` pins the file layout / exports / content separation / tokens; `build.test.ts` proves `vite build` bundles the tree. |

## Editing rules

- **Colours, hairlines, and fonts change in `src/styles.css` `@theme` and nowhere
  else.** It owns the only raw hex; components reference tokens through generated
  utilities (`bg-ground`, `text-cream`, `border-hairline-22`, `text-cream-68` …) or
  the decorative `@utility` classes (`bg-hero-glow`, `bg-moat-a`, `bg-plan-scrim` …).
  A raw hex in any `src/**/*.tsx` fails `test/architecture.test.ts`.
- **Copy lives in `src/content/`.** A section must import its strings, never inline
  them — the separation guard fails otherwise. Copy edits keep the copy-parity
  anchors green in the same change.
- **Reusable look lives in `src/design/`.** A section composes these elements; it
  does not re-declare typography or button skins.
- **Responsive intents are preserved at 1100 / 980 / 680** via Tailwind `max-[…]:`
  variants (desktop-first, matching the retired stylesheet). Keyboard focus draws a
  gold `:focus-visible` ring — the a11y quality floor.
- **Interactivity** (plan select, FAQ accordion) is React `useState`; its default is
  what SSR emits and the copy-parity suite pins (funnel selected, FAQ item 0 open),
  exposed via the `data-plan` / `data-selected` / `data-faq` / `data-open` hooks.

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
layout shift or privacy leak), which the architecture suite enforces: every
`@font-face` `url()` must resolve to a local `../fonts/` file and no external
`http(s)` host may appear anywhere in `src/`.

## Visual source of truth

Machine tests pin copy, token values, and default state — not pixels. The **"Revenue
OS Design System" project on claude.ai — its Marketing group — is the visual source
of truth** for this surface. Port visual changes from there; this app is the faithful
componentized build of that design.
