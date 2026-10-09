// withOrg (src/client.ts) when the database drops the connection its transaction holds: a restart or a network cut
// while a job waits on a slow call (the agent turn holds its transaction across the AI model's answer). The drop
// must fail that unit of work, never end the process, and leave the pool handing out working connections. The
// connection runs through a relay this test cuts, to the real local database, as the app_service login.
import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { type AddressInfo, connect, createServer, type Socket } from "node:net";
import { createPool, withOrg } from "../src";

const APP_SERVICE_URL =
  process.env.DATABASE_URL ||
  "postgresql://app_service:app_service_local@127.0.0.1:54322/postgres";
const DB_HOST = new URL(APP_SERVICE_URL).host;

/** A relay to the real database on a free local port; `cut` drops every connection it carries. */
async function relay() {
  const sockets = new Set<Socket>();
  const server = createServer((inbound) => {
    const [host, port] = DB_HOST.split(":");
    const outbound = connect(Number(port || 5432), host);
    for (const s of [inbound, outbound]) {
      sockets.add(s);
      s.on("error", () => {});
      s.on("close", () => sockets.delete(s));
    }
    inbound.pipe(outbound).pipe(inbound);
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as AddressInfo).port;
  return {
    url: APP_SERVICE_URL.replace(`@${DB_HOST}`, `@127.0.0.1:${port}`),
    cut: () => {
      for (const s of sockets) s.destroy();
    },
    close: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const one = async (tx: {
  query: (q: string) => Promise<{ rows: { n: number }[] }>;
}) => (await tx.query("select 1 as n")).rows[0]?.n;

describe("withOrg when the database drops its connection", () => {
  it("fails that unit of work while it waits, keeps the process alive, and hands out a working connection next", async () => {
    const r = await relay();
    const pool = createPool(r.url);
    const org = randomUUID();
    try {
      // The pool's first connection, before any withOrg: what a returned connection must look like again.
      const fresh = await pool.connect();
      const listening = fresh.listenerCount("error");
      fresh.release();

      const waiting = withOrg(pool, org, async (tx) => {
        await one(tx);
        r.cut(); // the database goes away while the transaction waits on something slow
        await sleep(300);
        return "done";
      });
      await expect(waiting).rejects.toThrow();

      expect(await withOrg(pool, org, one)).toBe(1);
      const returned = await pool.connect();
      try {
        expect(returned.listenerCount("error")).toBe(listening);
      } finally {
        returned.release();
      }
    } finally {
      await pool.end();
      await r.close();
    }
  });

  it("discards a connection that dropped during a query, so the next unit of work gets a working one", async () => {
    const r = await relay();
    const pool = createPool(r.url);
    const org = randomUUID();
    try {
      const running = withOrg(pool, org, async (tx) => {
        const slow = tx.query("select pg_sleep(2)");
        await sleep(200);
        r.cut(); // dropped mid-query
        await slow;
      });
      await expect(running).rejects.toThrow();
      expect(await withOrg(pool, org, one)).toBe(1);
    } finally {
      await pool.end();
      await r.close();
    }
  });
});
