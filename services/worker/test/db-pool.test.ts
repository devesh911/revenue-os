// The worker's database pool (services/worker/src/db.ts).
import { describe, expect, it } from "bun:test";
import { pool } from "../src/db";

describe("the worker's database pool", () => {
  // Unheard, an 'error' on a pg pool (an idle connection the database dropped: a restart, a network cut) ends the
  // process, so the worker would die instead of answering "not ready".
  it("outlives a connection the database drops", () => {
    expect(() => pool.emit("error", new Error("terminated"))).not.toThrow();
  });
});
