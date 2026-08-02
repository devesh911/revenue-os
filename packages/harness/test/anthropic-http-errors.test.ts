// task-57 RED — H2: an Anthropic HTTP error must THROW, never masquerade as "the model said nothing".
//
// TODAY: anthropic.ts:55-64 parses the body regardless of status — no res.ok check, no try/catch.
// A 401/429/500/529 error envelope has no `content` array, so complete() returns
// {text:"", toolCalls:[], usage:{in:0,out:0}} and loop.ts:116-123 appends nothing and returns
// NORMALLY. Nothing throws, so pg-boss never retries and the job is recorded as a success; because
// the agent-turn job's idempotency marker is message-derived, the inbound customer message is left
// PERMANENTLY unanswered. emitUsage still writes a 0-token row, so the metering trail claims a turn
// happened. LlmProvider.complete (types.ts:68-75) admits no error channel — throwing is the only
// honest failure signal, and it is what the durability story (loop.ts:4) already assumes.
//
// SCOPE (verifier-narrowed): the silent window is EXACTLY "HTTP error status WITH a well-formed
// JSON body". Transport rejections and non-JSON bodies already propagate — the last three tests
// pin that behavior so a fix cannot swallow them on the way past.
//
// WHAT THESE TESTS PIN: that complete() rejects, and that the HTTP status is discoverable on the
// thrown error (as an `err.status` property OR in the message — either is fine). Deliberately NOT
// pinned: the error class, the message wording, or whether the provider reads the body first.
//
// ENV-FREE / NETWORK-FREE / KEY-FREE: globalThis.fetch is replaced per test and restored in
// afterEach (the convention of test/anthropic.test.ts). No socket, no .env, no DB. No new table,
// so the cross-tenant-denial non-negotiable does not apply here (flagged in the report).
import { afterEach, describe, expect, it } from "bun:test";
import { createAnthropicProvider } from "../src/llm";
import type { LlmTurn, Msg } from "../src/types";

let restoreFetch: (() => void) | null = null;

function stubFetch(
  handler: (init?: unknown) => Promise<Response> | Response,
): void {
  const real = globalThis.fetch;
  globalThis.fetch = ((_input: unknown, init?: unknown) =>
    Promise.resolve(handler(init))) as unknown as typeof globalThis.fetch;
  restoreFetch = () => {
    globalThis.fetch = real;
  };
}

/** A well-formed Anthropic error envelope: valid JSON, and NO `content` array. */
const errorEnvelope = (type: string, message: string) =>
  JSON.stringify({ type: "error", error: { type, message } });

function stubStatus(status: number, body: string, contentType: string): void {
  stubFetch(
    () =>
      new Response(body, { status, headers: { "content-type": contentType } }),
  );
}

afterEach(() => {
  restoreFetch?.();
  restoreFetch = null;
});

const provider = () =>
  createAnthropicProvider({ apiKey: "test-key", model: "claude-test" });
const REQ = {
  system: "You are a test agent.",
  messages: [{ role: "contact", content: "hi" }] as Msg[],
};

/** Everything the caller could inspect on the throw — status property OR message text. */
const errText = (err: unknown): string => {
  const e = err as { status?: unknown; message?: unknown } | undefined;
  return `${String(e?.status ?? "")} ${String(e?.message ?? err)}`;
};

async function callIt(): Promise<{ returned?: LlmTurn; caught?: unknown }> {
  try {
    return { returned: await provider().complete(REQ) };
  } catch (caught) {
    return { caught };
  }
}

const ERROR_CASES: [number, string][] = [
  [401, "authentication_error"], // expired/rotated key — today the whole fleet no-ops
  [429, "rate_limit_error"], // the retry case pg-boss exists for
  [500, "api_error"],
  [529, "overloaded_error"],
];

describe("task-57 H2 — an HTTP error with a JSON body throws (so the queue retries)", () => {
  for (const [status, type] of ERROR_CASES) {
    it(`HTTP ${status} (${type}) rejects instead of returning an empty turn`, async () => {
      stubStatus(
        status,
        errorEnvelope(type, `simulated ${type}`),
        "application/json",
      );
      const { returned, caught } = await callIt();
      // The defect, stated: today this is {text:"",toolCalls:[],usage:{in:0,out:0}}.
      expect(returned).toBeUndefined();
      expect(caught).toBeDefined();
      // and the status must survive onto the error, so a caller can tell 429 from 401.
      expect(errText(caught)).toContain(String(status));
    });
  }
});

describe("task-57 H2 — behavior that must NOT change (guards)", () => {
  it("a 200 with a normal body still parses into an LlmTurn", async () => {
    stubStatus(
      200,
      JSON.stringify({
        id: "msg_ok",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Hello." }],
        usage: { input_tokens: 7, output_tokens: 3 },
      }),
      "application/json",
    );
    const { returned, caught } = await callIt();
    expect(caught).toBeUndefined();
    expect(returned?.text).toBe("Hello.");
    expect(returned?.usage).toEqual({ in: 7, out: 3 });
  });

  it("a transport error (fetch rejects) still propagates to the caller", async () => {
    const boom = new Error("ECONNRESET-MARKER");
    stubFetch(() => Promise.reject(boom));
    const { returned, caught } = await callIt();
    expect(returned).toBeUndefined();
    expect(errText(caught)).toContain("ECONNRESET-MARKER");
  });

  it("an HTTP error with a NON-JSON body still throws (never a silent empty turn)", async () => {
    stubStatus(502, "<html>upstream is down</html>", "text/html");
    const { returned, caught } = await callIt();
    expect(returned).toBeUndefined();
    expect(caught).toBeDefined();
  });
});
