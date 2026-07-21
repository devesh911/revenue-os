# apps/www — marketing landing page

Static, zero-dependency landing page: one hand-authored `index.html` with all copy and data baked in, fonts self-hosted under `fonts/`, and a single inline `<script>` for the plan-select and FAQ-accordion behavior. No build step, no framework, and deliberately no `package.json`.

Preview locally with any static file server — e.g. run `python3 -m http.server` from this directory and open the printed URL.

This supersedes the earlier week-3 Astro reservation (`bun create astro@latest`): the site ships as static HTML instead. `test/landing.test.ts` is its verdict (content fidelity, self-containment, self-hosted fonts, default-state contract).
