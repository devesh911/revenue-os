// Browser checks for what the landing page promises about motion, run against a
// production build (the "www" project in apps/console/playwright.config.ts, part of
// `bun run e2e`): under reduced motion nothing moves, no looping dot is on show and
// the scroll reveal hides nothing; with motion, every block the reveal hides rises in
// once it has been on screen; and the Pause switch (WCAG 2.2.2) stops every animation
// and looping dot on every screen of the page, finishing the hero's floor plan rather
// than freezing it half drawn. How it works' steps have their own checks
// (how-it-works.e2e.ts).
import { expect, type Page, test } from "@playwright/test";
import { motionToggle } from "../src/content/site";

// What moves now: the CSS animations and transitions running, and the SVG loops
// (repeatCount="indefinite"): how many there are, how many are on show (no
// display: none above them) and how many of those are live (their SVG not paused).
const motion = (page: Page) =>
  page.evaluate(() => {
    const shown = (el: Element) => {
      for (let n: Element | null = el; n; n = n.parentElement)
        if (getComputedStyle(n).display === "none") return false;
      return true;
    };
    const root = (el: SVGElement) => {
      let svg = el.ownerSVGElement;
      while (svg?.ownerSVGElement) svg = svg.ownerSVGElement;
      return svg;
    };
    const running = document
      .getAnimations()
      .filter((a) => a.playState === "running");
    const loops = [...document.querySelectorAll<SVGElement>("svg *")].filter(
      (el) => el.getAttribute("repeatCount") === "indefinite",
    );
    const onShow = loops.filter(shown);
    return {
      animations: running.flatMap((a) =>
        a instanceof CSSAnimation ? [a.animationName] : [],
      ),
      transitions: running.filter((a) => a instanceof CSSTransition).length,
      loops: loops.length,
      shown: onShow.length,
      live: onShow.filter((el) => !root(el)?.animationsPaused()).length,
    };
  });

// How many blocks the scroll reveal is holding back (fully transparent).
const held = (page: Page) =>
  page
    .locator("[data-reveal]")
    .evaluateAll(
      (els) => els.filter((e) => getComputedStyle(e).opacity === "0").length,
    );

// Visit the page a screen at a time, top to bottom (instantly: it scrolls smoothly
// by default), giving whatever starts on screen time to start before `check`.
async function eachScreen(page: Page, check = async () => {}) {
  const [height, screen] = await page.evaluate(() => [
    document.documentElement.scrollHeight,
    window.innerHeight,
  ]);
  for (let top = 0; top < height; top += screen) {
    await page.evaluate(
      (y) => window.scrollTo({ top: y, behavior: "instant" }),
      top,
    );
    await page.waitForTimeout(250);
    await check();
  }
}

test.describe("under reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("nothing moves, no looping dot is on show and nothing waits hidden, on every screen", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("[data-plot]")).toHaveAttribute(
      "data-plot",
      "done",
    );
    expect(await page.locator("[data-reveal]").count()).toBeGreaterThan(0);
    expect(await held(page), "the reveal hides nothing").toBe(0);
    expect((await motion(page)).loops, "the page has loops").toBeGreaterThan(0);
    await eachScreen(page, async () => {
      await expect
        .poll(async () => {
          const { animations, transitions, shown } = await motion(page);
          return { animations, transitions, shown };
        })
        .toEqual({ animations: [], transitions: 0, shown: 0 });
    });
  });
});

test.describe("with motion", () => {
  // The reveal hides a block only once the page has opted in (html[data-motion]); a
  // browser without the scroll observer never opts in, so nothing is ever hidden.
  test("without the scroll observer, the page never opts in and hides nothing", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      delete (window as { IntersectionObserver?: unknown })
        .IntersectionObserver;
    });
    await page.goto("/");
    expect(await page.locator("[data-reveal]").count()).toBeGreaterThan(0);
    await expect(page.locator("html")).not.toHaveAttribute("data-motion");
    // past the reveal's 0.9 s fade, so a block on its way out would be caught
    await page.waitForTimeout(1500);
    expect(await held(page)).toBe(0);
  });

  // A block starts hidden and only ever rises in: on load none fades from shown to
  // hidden (the page opts in to the reveal before any block exists), and the first
  // screen's blocks rise in by themselves.
  test("on load no block fades out, and the first screen rises in", async ({
    page,
  }) => {
    // Every opacity transition a reveal block starts, as [from, to].
    await page.addInitScript(() => {
      const runs: number[][] = [];
      Object.assign(window, { runs });
      document.addEventListener(
        "transitionrun",
        (e) => {
          const el = e.target as Element;
          if (e.propertyName !== "opacity" || !el.hasAttribute("data-reveal"))
            return;
          for (const a of el.getAnimations())
            if (
              a instanceof CSSTransition &&
              a.transitionProperty === "opacity"
            )
              runs.push(
                (a.effect as KeyframeEffect)
                  .getKeyframes()
                  .map((k) => Number(k.opacity)),
              );
        },
        true,
      );
    });
    await page.goto("/");
    const firstScreen = page.locator("#main [data-reveal]").first();
    await expect(firstScreen).toHaveCSS("opacity", "1");
    // past the longest first-screen delay and the 0.9 s rise
    await page.waitForTimeout(1500);
    const runs = await page.evaluate(
      () => (window as unknown as { runs: number[][] }).runs,
    );
    expect(runs.length, "the first screen rises in").toBeGreaterThan(0);
    expect(
      runs.filter(([from, to]) => to < from),
      "no reveal block fades out",
    ).toEqual([]);
  });

  test("every block the scroll reveal hides rises in once it has been on screen", async ({
    page,
  }) => {
    await page.goto("/");
    await expect
      .poll(() => held(page), "blocks below the fold wait")
      .toBeGreaterThan(0);
    await eachScreen(page);
    await expect.poll(() => held(page)).toBe(0);
  });

  test("the Pause switch stops every animation and looping dot on every screen, and finishes the floor plan", async ({
    page,
  }) => {
    await page.goto("/");
    const plan = page.locator("[data-plot]");
    await expect(plan).toHaveAttribute("data-plot", "run");
    await expect
      .poll(async () => (await motion(page)).animations.length)
      .toBeGreaterThan(0);
    // a looping dot plays once its drawing is on screen
    await page.evaluate(() =>
      [...document.querySelectorAll("svg *")]
        .find((el) => el.getAttribute("repeatCount") === "indefinite")
        ?.closest("svg")
        ?.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    await expect.poll(async () => (await motion(page)).live).toBeGreaterThan(0);

    await page.getByRole("button", { name: motionToggle.pause }).click();
    // the drawing shows complete, never frozen part way
    await expect(plan).toHaveAttribute("data-plot", "done");
    expect(
      await plan.evaluate(
        (el) =>
          el
            .getAnimations({ subtree: true })
            .filter((a) => a.playState !== "finished").length,
      ),
    ).toBe(0);
    await eachScreen(page, async () => {
      await expect
        .poll(async () => {
          const { animations, live } = await motion(page);
          return { animations, live };
        })
        .toEqual({ animations: [], live: 0 });
    });
  });
});
