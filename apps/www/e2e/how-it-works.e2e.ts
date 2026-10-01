// Browser checks for the landing page's How it works section (sections/HowItWorks.tsx,
// visuals/HowSteps.tsx): the five steps beside the product window, run against a
// production build (the "www" project in apps/console/playwright.config.ts, part of
// `bun run e2e`). The server-render tests (test/copy-parity) see only the finished
// frame; these prove what moves: the steps advancing on their own, choosing a step by
// click or key, the window swapping between the call brief and the intent study, the
// focus order, the Pause switch, reduced motion showing finished frames at once, the
// headline's clay accent words, the plate keeping clear of the lede and no sideways
// scroll on a phone.
// The steps' clock is Playwright's fake clock (page.clock), stepped in short slices so
// React renders between beats; CSS transitions still run in real time, so anything
// that fades in is polled.
import { expect, type Locator, type Page, test } from "@playwright/test";
import { howItWorks } from "../src/content/beforeCall";
import { callBrief } from "../src/content/callBrief";
import { intentEvidence } from "../src/content/intentEvidence";
import { motionToggle } from "../src/content/site";

const how = (page: Page) => page.locator("#how");
const tabs = (page: Page) => how(page).getByRole("tab");
const panel = (page: Page) => how(page).getByRole("tabpanel");
const brief = (page: Page) => how(page).locator('[data-pane="brief"]');
const study = (page: Page) => how(page).locator('[data-pane="study"]');
const chip = intentEvidence.callNow.chip;

// A person can see it: some match has a box, and neither it nor any ancestor is
// hidden, faded out or clipped away (a row not yet written in).
const onShow = (el: Locator) =>
  el.evaluateAll((els) =>
    els.some((e) => {
      if (!e.getClientRects().length) return false;
      for (let n: Element | null = e; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.visibility === "hidden" || Number(s.opacity) < 0.99) return false;
        if (s.clipPath !== "none" && !/^inset\(0(px)?\)$/.test(s.clipPath))
          return false;
      }
      return true;
    }),
  );
const selected = (page: Page) =>
  tabs(page).evaluateAll((ts) =>
    ts.findIndex((t) => t.getAttribute("aria-selected") === "true"),
  );

// Bring the window on screen (instantly: the page scrolls smoothly by default), wait
// for its scroll reveal to finish and, with motion, until the steps are playing.
async function showWindow(page: Page, playing = true) {
  await panel(page).evaluate((w) =>
    window.scrollTo({
      top: w.getBoundingClientRect().top + window.scrollY - 160,
      behavior: "instant",
    }),
  );
  await expect.poll(() => onShow(panel(page))).toBe(true);
  if (playing) await expect(how(page).locator("[data-paused]")).toHaveCount(0);
}
// Move the steps' clock on, a slice at a time.
async function advance(page: Page, ms: number) {
  for (let t = 0; t < ms; t += 100) await page.clock.runFor(100);
}
// The page loads on a fake clock, then it stops: from here only advance() moves it.
const T0 = Date.parse("2026-09-29T19:12:00+05:30");
async function freezeClock(page: Page) {
  await page.clock.install({ time: T0 });
  await page.goto("/");
  await page.clock.pauseAt(T0 + 60_000);
}

test.describe("How it works, with motion (1440 × 900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("plays step 1 once the window is on screen, then moves on to step 2, the caption bar never blank", async ({
    page,
  }) => {
    await freezeClock(page);
    await showWindow(page);
    await expect(tabs(page).nth(0)).toHaveAttribute("aria-selected", "true");
    await expect(brief(page)).toBeVisible();
    await expect(study(page)).toBeHidden();

    // the brief's next caption arrives with its timestamp already on show
    const [first, next] = callBrief.captions;
    await advance(page, 900);
    const time = brief(page)
      .locator("[data-pin]")
      .getByText(next?.time ?? "", { exact: true });
    await expect(time).toBeVisible();
    expect(
      await onShow(time),
      `${first?.time} gives way to ${next?.time}`,
    ).toBe(true);

    await advance(page, 4000); // 4.9 s: still step 1 (it lasts 5.8 s)
    expect(await selected(page)).toBe(0);
    await advance(page, 1600); // 6.5 s
    expect(await selected(page)).toBe(1);
    await expect(brief(page)).toBeVisible();
    await expect(study(page)).toBeHidden();
  });

  test("choosing step 4 shows the intent study to 'Calling Rohan', and the step stays chosen", async ({
    page,
  }) => {
    await freezeClock(page);
    await showWindow(page);
    await tabs(page).nth(3).click();
    await expect(tabs(page).nth(3)).toHaveAttribute("aria-selected", "true");
    await expect(study(page)).toBeVisible();
    await expect(brief(page)).toBeHidden();
    await advance(page, 12_000); // past "Call now" lighting at 10.9 s
    await expect.poll(() => onShow(study(page).getByText(chip))).toBe(true);
    await advance(page, 16_000);
    expect(await selected(page)).toBe(3);
  });

  test("arrow keys move the selection and the focus; Tab reaches the window, then the Sound switch", async ({
    page,
  }) => {
    await freezeClock(page);
    await showWindow(page);
    await tabs(page).nth(3).click();
    await expect(tabs(page).nth(3)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(tabs(page).nth(4)).toHaveAttribute("aria-selected", "true");
    await expect(tabs(page).nth(4)).toBeFocused();
    await expect(brief(page)).toBeVisible(); // the brief is back (its Sound switch with it)
    await page.keyboard.press("Tab");
    await expect(panel(page)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      how(page).getByRole("button", { name: callBrief.sound.label }),
    ).toBeFocused();
  });

  test("the Pause switch stops the steps, and a step chosen while paused shows its finished frame at once", async ({
    page,
  }) => {
    await freezeClock(page);
    await showWindow(page);
    await page.getByRole("button", { name: motionToggle.pause }).click();
    await showWindow(page, false);
    const at = await selected(page);
    await advance(page, 20_000);
    expect(await selected(page)).toBe(at);

    await tabs(page).nth(3).click();
    await page.waitForTimeout(150);
    for (const t of [intentEvidence.callNow.title, chip])
      expect(await onShow(study(page).getByText(t, { exact: true })), t).toBe(
        true,
      );
    await advance(page, 20_000);
    expect(await selected(page)).toBe(3);
  });

  test("the headline's accent words are clay-type, the rest ink", async ({
    page,
  }) => {
    await page.goto("/");
    const c = await how(page)
      .locator("h2")
      .evaluate((h2) => {
        const probe = document.createElement("span");
        document.body.append(probe);
        const colour = (token: string) => {
          probe.style.color = `var(${token})`;
          return getComputedStyle(probe).color;
        };
        const out = {
          words: [...h2.querySelectorAll("span")].map((s) => s.textContent),
          accents: [...h2.querySelectorAll("span")].map(
            (s) => getComputedStyle(s).color,
          ),
          h2: getComputedStyle(h2).color,
          clay: colour("--color-clay-type"),
          ink: colour("--color-ink"),
        };
        probe.remove();
        return out;
      });
    expect(c.words).toEqual([...howItWorks.accents]);
    expect(c.clay).not.toBe(c.ink);
    for (const a of c.accents) expect(a).toBe(c.clay);
    expect(c.h2).toBe(c.ink);
  });
});

test.describe("How it works, under reduced motion", () => {
  test.use({
    contextOptions: { reducedMotion: "reduce" },
    viewport: { width: 1440, height: 900 },
  });

  test("opens on the finished story, and every chosen step shows its finished frame at once", async ({
    page,
  }) => {
    await page.goto("/");
    await showWindow(page, false);
    expect(await selected(page)).toBe(4);
    expect(await onShow(brief(page).getByText(callBrief.footer.stamp))).toBe(
      true,
    );

    await tabs(page).nth(3).click();
    await page.waitForTimeout(100);
    for (const t of [intentEvidence.callNow.title, chip, "78"])
      expect(await onShow(study(page).getByText(t, { exact: true })), t).toBe(
        true,
      );

    await tabs(page).nth(4).click();
    await page.waitForTimeout(100);
    for (const t of [callBrief.plan.steps.at(-1)?.text, callBrief.footer.stamp])
      expect(
        await onShow(brief(page).getByText(t ?? "", { exact: true })),
        t,
      ).toBe(true);

    // step 2 ends on the brief's fifth caption: on show, whole, with no caret
    await tabs(page).nth(1).click();
    await page.waitForTimeout(100);
    const caption = callBrief.captions[4]?.text ?? "";
    expect(await onShow(brief(page).getByText(caption)), caption).toBe(true);
  });

  for (const width of [1024, 1280, 1440])
    test(`the clay plate keeps at least 48px clear of the heading and lede at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const gaps = await how(page).evaluate((section) => {
        const plate = section.querySelector(".how-plate");
        const h2 = section.querySelector("h2");
        const lede = h2?.nextElementSibling;
        if (!plate || !h2 || !lede) return [];
        const p = plate.getBoundingClientRect();
        return [h2, lede].map((el) => {
          const b = el.getBoundingClientRect();
          return Math.max(
            p.left - b.right,
            b.left - p.right,
            p.top - b.bottom,
            b.top - p.bottom,
          );
        });
      });
      expect(gaps).toHaveLength(2);
      for (const g of gaps) expect(g).toBeGreaterThanOrEqual(48);
    });

  test("on a phone: no sideways scroll, and step 4 frames the score with 'Call now' under the pinned header", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);

    await showWindow(page, false);
    await tabs(page).nth(3).click();
    await page.waitForTimeout(100);
    const pane = await study(page).boundingBox();
    const pin = await study(page).locator("[data-pin]").boundingBox();
    expect(pane && pin).toBeTruthy();
    for (const t of [intentEvidence.high, intentEvidence.callNow.title, chip]) {
      const box = await study(page).getByText(t, { exact: true }).boundingBox();
      expect(box, t).toBeTruthy();
      if (!box || !pane || !pin) continue;
      expect(box.y, `${t} clears the pinned header`).toBeGreaterThanOrEqual(
        pin.y + pin.height,
      );
      expect(
        box.y + box.height,
        `${t} is inside the window`,
      ).toBeLessThanOrEqual(pane.y + pane.height);
    }
  });
});
