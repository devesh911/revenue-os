// Browser check for the hero's sample call (visuals/SampleAudio.tsx), run against a
// production build (the "www" project in apps/console/playwright.config.ts, part of
// `bun run e2e`). The server-render tests (test/copy-parity) see the button, its note
// and the closed transcript; this proves what a visitor does with them: the recording
// plays and pauses in place, its real length is the one the button shows, and the
// transcript opens by mouse or keyboard, on a card that keeps its small speaker labels
// readable over the hero's graph paper.
import { expect, test } from "@playwright/test";
import { sampleCall } from "../src/content/hero";
import { contrast } from "./contrast";

const clock = `${Math.floor(sampleCall.seconds / 60)}:${String(sampleCall.seconds % 60).padStart(2, "0")}`;

test("the sample call plays in place and pauses, and its transcript opens, readable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  // The recording is a detached Audio element: keep a handle on whatever plays.
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      (window as unknown as { sample: HTMLMediaElement }).sample = this;
      return play.call(this);
    };
  });
  await page.goto("/");
  const audio = () =>
    page.evaluate(() => {
      const a = (window as unknown as { sample: HTMLMediaElement }).sample;
      return { time: a.currentTime, duration: a.duration, paused: a.paused };
    });

  // The button's name ends with the length it shows, whatever its label says.
  const button = page.getByRole("button", { name: new RegExp(`${clock}$`) });
  await expect(button).toHaveAccessibleName(`Hear a sample call ${clock}`);
  const fetched = page.waitForResponse((r) => r.url().endsWith(sampleCall.src));
  await button.click();
  expect([200, 206]).toContain((await fetched).status());
  await expect(button).toHaveAccessibleName(`${sampleCall.pause} ${clock}`);
  await expect.poll(async () => (await audio()).time).toBeGreaterThan(0.5);
  expect(Math.abs((await audio()).duration - sampleCall.seconds)).toBeLessThan(
    1,
  );

  await button.click();
  await expect(button).toHaveAccessibleName(`${sampleCall.resume} ${clock}`);
  expect((await audio()).paused).toBe(true);
  await expect(page.getByText(sampleCall.unavailable)).toHaveCount(0);

  // The transcript: closed, opened by a click, closed again from the keyboard.
  const transcript = page.locator("details", {
    hasText: sampleCall.transcriptLabel,
  });
  const summary = transcript.locator("summary");
  await expect(transcript).not.toHaveAttribute("open");
  await summary.click();
  const lines = transcript.locator("li");
  await expect(lines).toHaveCount(sampleCall.transcript.length);
  await expect(lines.first()).toBeVisible();
  await expect(lines.first()).toContainText("AI assistant");
  // Every speaker label clears 4.5:1 against the card it sits on.
  const pairs = await transcript
    .locator("li > span:first-child")
    .evaluateAll((spans) =>
      spans.map((s) => [
        getComputedStyle(s).color,
        getComputedStyle(s.closest("ol") as Element).backgroundColor,
      ]),
    );
  for (const [ink, ground] of pairs) {
    expect(ground, "the transcript paints its own ground").not.toMatch(
      /transparent|rgba\([^)]*,\s*0\)/,
    );
    expect(contrast(ink, ground)).toBeGreaterThanOrEqual(4.5);
  }
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(transcript).not.toHaveAttribute("open");
  expect(errors).toEqual([]);
});
