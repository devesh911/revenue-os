// Repro (2026-07-11, first real browser drive of the console): the console at :5173
// fetches the worker at :8080 cross-origin. The browser preflight (OPTIONS + Origin,
// no Authorization — preflights never carry credentials) hit requireAuth → 401 → every
// API call from the console died. The worker must answer preflights BEFORE auth, with
// an explicit origin allowlist (S3/S4 posture: never "*").
import { describe, expect, it } from "bun:test";
import app from "../src/index";

const DEV_ORIGIN = "http://localhost:5173";

function preflight(path: string, origin: string) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: "OPTIONS",
      headers: new Headers({
        origin,
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      }),
    }),
  );
}

describe("worker CORS (console at :5173 → worker at :8080)", () => {
  it("answers the preflight for an allowlisted origin without demanding auth", async () => {
    const res = await preflight("/orgs", DEV_ORIGIN);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(DEV_ORIGIN);
    expect(
      (res.headers.get("access-control-allow-headers") ?? "").toLowerCase(),
    ).toContain("authorization");
  });

  it("echoes the allowed origin on actual responses", async () => {
    const res = await app.fetch(
      new Request("http://localhost/health", {
        headers: new Headers({ origin: DEV_ORIGIN }),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(DEV_ORIGIN);
  });

  it("never reflects a foreign origin (explicit allowlist, not *)", async () => {
    const res = await preflight("/orgs", "https://evil.example");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
