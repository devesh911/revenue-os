// The dev login's lock (tests/dev-login-lock.ts): a second holder waits until the first lets go.
import { expect, it } from "bun:test";
import { holdDevLogin } from "./dev-login-lock";

const LOCAL_DB_URL =
  process.env.LOCAL_DB_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

it("a second test run waits for the dev login until the first lets go of it", async () => {
  const first = await holdDevLogin(LOCAL_DB_URL);
  let second: Awaited<ReturnType<typeof holdDevLogin>> | undefined;
  const waiting = holdDevLogin(LOCAL_DB_URL).then((held) => {
    second = held;
  });
  await new Promise((wait) => setTimeout(wait, 300));
  expect(second).toBeUndefined();
  await first.release();
  await waiting;
  expect(second).toBeDefined();
  await second?.release();
});
