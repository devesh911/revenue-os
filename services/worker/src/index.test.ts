// Task 1 acceptance: `bun test` green on the empty project — this is the first real test.
// S5.9: /health must be information-free (status only); /ready needs its own bearer token.
import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { requireReadyToken } from "./auth";
import { EnvSchema } from "./env";
import app from "./index";

const TOKEN = "a".repeat(64);

describe("worker health endpoints", () => {
  it("GET /health returns ok and nothing else", async () => {
    const res = await app.fetch(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  // Repro (2026-09-25): Cloudflare's Transform Rule stamps X-Edge-Auth on EVERY request it
  // forwards, so a stranger arriving through the edge carried the header and read /ready.
  it("GET /ready refuses a caller holding only the edge header", async () => {
    const res = await app.fetch(
      new Request("http://localhost/ready", {
        headers: { "x-edge-auth": "whatever-cloudflare-stamped" },
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("requireReadyToken", () => {
  const probe = (token: string | undefined, authorization?: string) =>
    new Hono()
      .get("/ready", requireReadyToken(token), (c) => c.text("ok"))
      .request("/ready", { headers: authorization ? { authorization } : {} });

  it("admits only the exact bearer token", async () => {
    expect((await probe(TOKEN, `Bearer ${TOKEN}`)).status).toBe(200);
    expect((await probe(TOKEN, `Bearer ${"b".repeat(64)}`)).status).toBe(401);
    expect((await probe(TOKEN)).status).toBe(401);
  });

  it("fails closed when no token is configured", async () => {
    expect((await probe(undefined, `Bearer ${TOKEN}`)).status).toBe(401);
    expect((await probe(undefined)).status).toBe(401);
  });

  it("env: READY_TOKEN is optional but refuses a short value", () => {
    const base = {
      DATABASE_URL: "postgresql://x@127.0.0.1:54322/postgres",
      SUPABASE_URL: "http://localhost:54321",
    };
    expect(EnvSchema.parse(base).READY_TOKEN).toBeUndefined();
    expect(EnvSchema.parse({ ...base, READY_TOKEN: TOKEN }).READY_TOKEN).toBe(
      TOKEN,
    );
    expect(EnvSchema.safeParse({ ...base, READY_TOKEN: "short" }).success).toBe(
      false,
    );
  });
});
