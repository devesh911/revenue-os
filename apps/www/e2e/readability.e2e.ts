// Browser check of the README's promise that small text stays readable, on the palette
// as the browser resolves it (src/styles.css): every colour the palette sets small text
// in keeps 4.5:1 (WCAG AA) on each ground it is used on, and the focus ring keeps 3:1.
// Runs against a production build (the "www" project in
// apps/console/playwright.config.ts, part of `bun run e2e`).
import { expect, test } from "@playwright/test";
import { contrast } from "./contrast";

// [text colour, the grounds it sits on], from the palette's own notes.
const SMALL_TEXT: Array<[string, string[]]> = [
  ["ink", ["paper", "paper-2", "card"]],
  ["ink-2", ["paper", "paper-2", "card"]],
  ["stone", ["paper", "paper-2", "card"]],
  ["clay-deep", ["paper"]],
  ["olive-deep", ["paper"]],
];
const FOCUS_GROUNDS = ["paper", "paper-2", "ink"];

test("small text keeps 4.5:1 on every ground it sits on, and the focus ring 3:1", async ({
  page,
}) => {
  await page.goto("/");
  // A token as the page resolves it; "" when the stylesheet doesn't define it.
  const colour = (token: string) =>
    page.evaluate((t) => {
      const name = `--color-${t}`;
      const root = getComputedStyle(document.documentElement);
      if (!root.getPropertyValue(name).trim()) return "";
      const probe = document.body.appendChild(document.createElement("i"));
      probe.style.color = `var(${name})`;
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return rgb;
    }, token);
  const pair = async (text: string, ground: string) => {
    const [a, b] = [await colour(text), await colour(ground)];
    expect(a, `--color-${text} is defined`).not.toBe("");
    expect(b, `--color-${ground} is defined`).not.toBe("");
    return contrast(a, b);
  };
  for (const [text, grounds] of SMALL_TEXT)
    for (const ground of grounds)
      expect(
        await pair(text, ground),
        `${text} on ${ground}`,
      ).toBeGreaterThanOrEqual(4.5);
  // The ring the page really draws: Tab to the first control and read its outline.
  await page.keyboard.press("Tab");
  const ring = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const s = getComputedStyle(el);
    return { colour: s.outlineColor, style: s.outlineStyle };
  });
  expect(ring, "Tab reaches a control").not.toBeNull();
  expect(ring?.style, "it draws a focus ring").not.toBe("none");
  for (const ground of FOCUS_GROUNDS)
    expect(
      contrast(ring?.colour ?? "", await colour(ground)),
      `the focus ring on ${ground}`,
    ).toBeGreaterThanOrEqual(3);
});
