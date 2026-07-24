# apps/www — marketing landing page

Static, zero-dependency landing page — the **marketing surface** of the two-surface
Revenue OS design system (the other surface is the product console). No build step,
no framework, and deliberately no `package.json`: it ships as hand-authored HTML +
CSS with self-hosted fonts. Preview locally with any static file server — e.g.
`python3 -m http.server` from this directory, then open the printed URL.

## Layout

| Path | What it holds |
| --- | --- |
| `index.html` | The page: semantic landmarks (`header` → `nav`, `main` → the content `section`s, `footer`), all copy and data baked in, and the **single inline `<script>`** that wires the plan-select and FAQ-accordion behaviour via `data-*` hooks. Carries **zero** `style=` attributes and no `<style>` block. |
| `styles/tokens.css` | The design tokens on `:root` (palette, cream-alpha channel, hairline scale, font families) **and** every `@font-face` block. Loaded **first**. |
| `styles/components.css` | The reusable look: colour, typography, buttons, cards, FAQ chrome, hover/focus, and the `data-*` state rules. Loaded **second**. |
| `styles/page.css` | Composition: page shell, section frames, grids, decorative glows, and **all** responsive rules. Loaded **last**. |
| `fonts/` | Self-hosted `.woff2` subsets (Playfair Display, IBM Plex Mono, Lora). Referenced from `tokens.css` as `../fonts/<file>.woff2`. |
| `test/` | The spec. `landing.test.ts` pins content fidelity, self-containment, self-hosted fonts, and the default-state contract; `structure.test.ts` pins the token layer, cascade order, semantic landmarks, and per-section copy parity. |

The three stylesheets are linked in cascade order **tokens → components → page**. That
order is load-bearing: `page.css` beats `components.css` at equal specificity purely
by coming last, which is why the responsive overrides need no priority flags.

## Editing rules

- **Colours, hairlines, fonts change in `tokens.css` and nowhere else.** It owns the
  only raw hex on the site; components/page reference tokens via `var()` only (a raw
  colour hex or a priority flag in those two files fails `test/structure.test.ts`).
- **Reusable class patterns live in `components.css`.** Two base classes carry the
  families (`.ro-mono`, `.ro-display`); a semantic class layers size/tracking/colour
  on top (e.g. `class="ro-mono ro-eyebrow"`). Body copy inherits Lora and needs no class.
- **Composition and responsive rules live in `page.css`.** Keep the breakpoints
  (1100 / 980 / 680) working and let cascade order — not priority flags — resolve them.
- **Copy edits must keep the `test/structure.test.ts` copy guards green.** Each
  section has a load-bearing string pinned there; changing it is a deliberate act that
  updates the guard in the same edit.
- Keep the existing `.ro-*` class names and the `data-plan` / `data-selected` /
  `data-faq` / `data-open` attributes: the inline `<script>` and the state CSS bind to them.

## Visual source of truth

Machine tests can pin copy and token values but not pixels. The **"Revenue OS Design
System" project on claude.ai — its Marketing group — is the visual source of truth**
for this surface. Port changes from there; this folder is the faithful static export.
