// Task 10 RED — the ~30-line typed fetch wrapper (T24: ours, axios rejected).
import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { apiFetch } from "../src";

const echoFetch: typeof fetch = async (input, init) => {
  const req = new Request(input, init);
  return Response.json({
    url: req.url,
    auth: req.headers.get("authorization"),
    ok: true,
  });
};

describe("apiFetch", () => {
  it("joins base+path, injects the bearer token, zod-parses the response", async () => {
    const Schema = z.object({
      url: z.string(),
      auth: z.string(),
      ok: z.boolean(),
    });
    const out = await apiFetch("https://api.example.com", "/orgs", Schema, {
      token: "tok-123",
      fetchImpl: echoFetch,
    });
    expect(out.url).toBe("https://api.example.com/orgs");
    expect(out.auth).toBe("Bearer tok-123");
  });

  it("throws on schema mismatch instead of returning garbage", async () => {
    const Wrong = z.object({ nope: z.string() });
    expect(
      apiFetch("https://api.example.com", "/orgs", Wrong, {
        fetchImpl: echoFetch,
      }),
    ).rejects.toThrow();
  });

  it("throws on non-2xx with a clean error", async () => {
    const failFetch: typeof fetch = async () =>
      new Response("boom", { status: 500 });
    expect(
      apiFetch("https://api.example.com", "/orgs", z.unknown(), {
        fetchImpl: failFetch,
      }),
    ).rejects.toThrow(/500/);
  });
});
