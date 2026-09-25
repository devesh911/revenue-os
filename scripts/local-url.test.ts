// The local-only guard the seeder and dev login trust before connecting as the database superuser.
import { expect, it } from "bun:test";
import { isLocalUrl } from "./local-url";

const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

it("accepts the local stack and refuses look-alike hosts", () => {
  expect(isLocalUrl(LOCAL)).toBe(true);
  expect(isLocalUrl("http://localhost:54321")).toBe(true);
  expect(isLocalUrl("postgresql://u:p@127.0.0.1.evil.example/db")).toBe(false);
  expect(isLocalUrl("not a url")).toBe(false);
});

// pg's connection-string parser prefers ?host= / ?hostaddr= over the URL's own host.
it("refuses a local-looking URL whose query overrides the host", () => {
  expect(isLocalUrl(`${LOCAL}?host=db.remote.example&port=5432`)).toBe(false);
  expect(isLocalUrl(`${LOCAL}?hostaddr=203.0.113.9`)).toBe(false);
  expect(isLocalUrl(`${LOCAL}?sslmode=disable`)).toBe(true);
});
