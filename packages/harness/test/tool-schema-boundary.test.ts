// task-57 RED — H1: the tool catalog must reach the LLM as REAL JSON Schema, not serialized Zod.
//
// TODAY: registry.ts:29 puts the live ZodType into ToolSpec.inputSchema and anthropic.ts:44-52
// drops it straight into Anthropic's `input_schema`. Serialized (zod 4.4.3) that object's top-level
// keys are ["def","type"] — it carries `"type":"object"` (so the request is ACCEPTED: unknown
// keywords are legal JSON Schema, there is no loud 400) but has NO `properties`. The model is
// therefore handed a PARAMETERLESS tool, emits `{}`, and the T11 zod seatbelt (loop.ts:138) rejects
// it as `invalid_args` on every round: tool calling cannot work in production, silently.
//
// WHAT THESE TESTS PIN — the CONTRACT at the boundary, never the mechanism. Every assertion reads
// the JSON body the adapter actually POSTs, driven through the real production composition
// (loop.ts:102-106 = buildCatalog(...).specs(allowed) → provider.complete({tools})). So a fix that
// converts in registry.specs() and a fix that converts inside the adapter BOTH pass. Deliberately
// NOT asserted: that ToolRegistry.specs() itself returns JSON Schema (that would pin one of the two
// legal fixes), and the presence/absence of `$schema`, `additionalProperties`, or any particular
// converter's extras (Anthropic ignores unknown keywords).
//
// ENV-FREE / NETWORK-FREE / KEY-FREE: globalThis.fetch is replaced by a stub that records the
// request body and returns a canned 200, restored in afterEach (the convention already used by
// test/anthropic.test.ts). No socket, no .env, no DB. TENANCY: no new table — the cross-tenant
// denial non-negotiable does not apply to a pure provider/registry boundary (flagged in the report).
import { afterEach, describe, expect, it } from "bun:test";
import { createAnthropicProvider } from "../src/llm";
import { buildCatalog } from "../src/tools";
import type { ToolSpec } from "../src/types";

type JsonObject = Record<string, unknown>;
type WireTool = { name: string; input_schema: JsonObject };

const CANNED_200 = {
  id: "msg_test",
  type: "message",
  role: "assistant",
  content: [{ type: "text", text: "ok" }],
  usage: { input_tokens: 1, output_tokens: 1 },
};

let restoreFetch: (() => void) | null = null;

/** Records every POSTed body; answers with a canned Anthropic 200. Never opens a socket. */
function installFetch(): { bodies: JsonObject[] } {
  const bodies: JsonObject[] = [];
  const real = globalThis.fetch;
  const fake = (_input: unknown, init?: unknown): Promise<Response> => {
    const raw = (init as { body?: unknown } | undefined)?.body;
    bodies.push(typeof raw === "string" ? (JSON.parse(raw) as JsonObject) : {});
    return Promise.resolve(
      new Response(JSON.stringify(CANNED_200), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  globalThis.fetch = fake as unknown as typeof globalThis.fetch;
  restoreFetch = () => {
    globalThis.fetch = real;
  };
  return { bodies };
}

afterEach(() => {
  restoreFetch?.();
  restoreFetch = null;
});

const NAMES = ["book_appointment", "update_contact", "send_confirmation"];

/** The real catalog, exactly as jobs.ts:125 builds it (the send port is irrelevant here). */
const catalogSpecs = (): ToolSpec[] =>
  buildCatalog({ send: async () => ({ ok: true }) }).specs(NAMES);

/** Drive the production composition and return the tools[] the adapter put on the wire. */
async function wireTools(): Promise<WireTool[]> {
  const { bodies } = installFetch();
  await createAnthropicProvider({
    apiKey: "test-key",
    model: "claude-test",
  }).complete({
    system: "You are a test agent.",
    messages: [{ role: "contact", content: "hi" }],
    tools: catalogSpecs(),
  });
  return (bodies[0]?.tools ?? []) as WireTool[];
}

const schemaOf = (tools: WireTool[], name: string): JsonObject =>
  tools.find((t) => t.name === name)?.input_schema ?? {};
const propsOf = (schema: JsonObject): JsonObject =>
  (schema.properties ?? {}) as JsonObject;
const typeOf = (prop: unknown): unknown =>
  (prop as JsonObject | undefined)?.type;

describe("task-57 H1 — the wire carries JSON Schema, not a serialized ZodType", () => {
  it("every production tool arrives with type:'object' AND a properties key", async () => {
    const tools = await wireTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...NAMES].sort());
    for (const name of NAMES) {
      const schema = schemaOf(tools, name);
      expect(schema.type).toBe("object");
      // The whole defect in one assertion: a serialized ZodType has no `properties`.
      expect(Object.hasOwn(schema, "properties")).toBe(true);
      expect(Object.keys(propsOf(schema)).length).toBeGreaterThan(0);
    }
  });

  it("send_confirmation's properties name every declared arg", async () => {
    const schema = schemaOf(await wireTools(), "send_confirmation");
    expect(Object.keys(propsOf(schema)).sort()).toEqual([
      "body",
      "channel",
      "contactId",
    ]);
  });

  it("arg types survive the conversion: the uuid format, the channel enum, the string body", async () => {
    const p = propsOf(schemaOf(await wireTools(), "send_confirmation"));
    expect(typeOf(p.contactId)).toBe("string");
    // format-agnostic: any rendering that keeps the uuid/guid hint passes.
    expect(JSON.stringify(p.contactId ?? null)).toMatch(/uuid|guid/i);
    const channel = JSON.stringify(p.channel ?? null);
    for (const value of ["whatsapp", "sms", "email"])
      expect(channel).toContain(value);
    expect(typeOf(p.body)).toBe("string");
  });

  it("required reflects the non-optional args (and optionals stay listed in properties)", async () => {
    const tools = await wireTools();
    const send = schemaOf(tools, "send_confirmation");
    expect([...((send.required as string[] | undefined) ?? [])].sort()).toEqual(
      ["body", "channel", "contactId"],
    );
    // update_contact declares firstName/lastName optional — named, but not required.
    const update = schemaOf(tools, "update_contact");
    expect(update.required).toEqual(["contactId"]);
    expect(Object.keys(propsOf(update)).sort()).toEqual([
      "contactId",
      "firstName",
      "lastName",
    ]);
  });

  it("no ZodType internals cross the wire", async () => {
    const wire = JSON.stringify(await wireTools());
    expect(wire).not.toMatch(/"def"\s*:/);
    expect(wire).not.toMatch(/"shape"\s*:/);
    expect(wire).not.toMatch(/"catchall"\s*:/);
    expect(wire).not.toMatch(/_zod/);
  });
});
