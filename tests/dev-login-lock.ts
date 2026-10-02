// The one shared dev login (scripts/dev-login.ts) is made, has its password changed and reset, and signs in, in
// the tests that check it. Each such test file holds this lock while it runs, so test runs started at the same
// moment take turns with it: one never signs in while another has its password changed, or signs it up at once.
import pg from "pg";

const KEY = 7_340_251; // a Postgres advisory lock number, the same in every run; nothing else on this stack uses it

/** Waits until no other test run holds the dev login, then holds it until `release` (or until this process ends). */
export async function holdDevLogin(
  dbUrl: string,
): Promise<{ release: () => Promise<void> }> {
  const lock = new pg.Client({ connectionString: dbUrl });
  await lock.connect();
  await lock.query("select pg_advisory_lock($1)", [KEY]);
  return { release: () => lock.end() };
}
