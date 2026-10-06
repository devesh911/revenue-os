// The worker's RELEASE setting (services/worker/src/env.ts): the commit its build came from, and nothing else, since /release shows it.
import { describe, expect, it } from "bun:test";
import { EnvSchema } from "../src/env";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

describe("RELEASE", () => {
  it("takes only a commit id, so the endpoint can show nothing else", () => {
    const base = {
      DATABASE_URL: "postgresql://x@127.0.0.1:54322/postgres",
      SUPABASE_URL: "http://localhost:54321",
    };
    expect(EnvSchema.parse(base).RELEASE).toBeUndefined();
    expect(EnvSchema.parse({ ...base, RELEASE: COMMIT }).RELEASE).toBe(COMMIT);
    expect(EnvSchema.parse({ ...base, RELEASE: "0123abc" }).RELEASE).toBe(
      "0123abc",
    );
    for (const bad of ["sk-live-abcdef", "0123ab", "main", `${COMMIT}0`])
      expect(EnvSchema.safeParse({ ...base, RELEASE: bad }).success).toBe(
        false,
      );
  });
});
