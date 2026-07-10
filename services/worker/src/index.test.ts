// Task 1 acceptance: `bun test` green on the empty project — this is the first real test.
// S5.9: /health must be information-free (status only).
import { describe, expect, it } from "bun:test";
import app from "./index";

describe("worker health endpoints", () => {
  it("GET /health returns ok and nothing else", async () => {
    const res = await app.fetch(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("GET /ready responds", async () => {
    const res = await app.fetch(new Request("http://localhost/ready"));
    expect(res.status).toBe(200);
  });
});
