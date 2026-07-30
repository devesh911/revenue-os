// Task 50 — the console data hook for GET /orgs/:orgId/agents. Mirrors features/screens/api.ts:
// R2 (server state via a TanStack Query hook keyed from a queryKeys factory) and R6 (every wire
// shape is Zod-parsed — the console never trusts the network). This suite imports the REAL module
// (no mock.module) to pin the hook's existence, the queryKeys factory, and that the exported
// response schema REJECTS a malformed payload.
//
// Env-free: importing features/*/api is import-safe (lib/api → lib/supabase builds the client
// lazily on first call, and VITE_API_URL falls back — see apps/console/src/lib/supabase.ts).
import { describe, expect, it } from "bun:test";

// features/agents/api does not exist yet (RED). Guarded import so its ABSENCE surfaces as a clean
// assertion ("hook/schema must be exported") rather than an unhandled module-resolution rejection.
async function loadAgentsApi(): Promise<Record<string, unknown>> {
  try {
    return (await import("../src/features/agents/api")) as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

// The lean wire shape the endpoint returns (agents: no system_prompt/voice/language; workflows: no
// definition). Digits chosen collision-free for the page render test elsewhere; here it just parses.
const VALID = {
  agents: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      key: "receptionist",
      version: 2,
      status: "active",
      model: "claude-sonnet-4-6",
      created_at: "2026-01-02T00:00:00Z",
    },
  ],
  workflows: [
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      key: "inbound-triage",
      version: 1,
      status: "draft",
      created_at: "2026-01-02T00:00:00Z",
    },
  ],
};

type Schema = { parse: (x: unknown) => unknown } | undefined;

describe("features/agents/api — hook + Zod contract (R2/R6)", () => {
  it("exports a useAgentsQuery hook", async () => {
    const mod = await loadAgentsApi();
    expect(typeof mod.useAgentsQuery).toBe("function");
  });

  it("queryKeys.agents(orgId) → ['agents', orgId] (stable factory, R2)", async () => {
    const mod = await loadAgentsApi();
    const keys = mod.queryKeys as
      | { agents?: (o: string) => unknown }
      | undefined;
    expect(typeof keys?.agents).toBe("function");
    expect(keys?.agents?.("org-1")).toEqual(["agents", "org-1"]);
  });

  it("exports an AgentsResponse Zod schema that ACCEPTS the lean wire shape", async () => {
    const schema = (await loadAgentsApi()).AgentsResponse as Schema;
    expect(schema).toBeDefined();
    expect(() => schema?.parse(VALID)).not.toThrow();
    // zero rows is a valid (honest-empty) response, not an error
    expect(() => schema?.parse({ agents: [], workflows: [] })).not.toThrow();
  });

  it("AgentsResponse REJECTS malformed payloads (R6: never trust the wire)", async () => {
    const schema = (await loadAgentsApi()).AgentsResponse as Schema;
    expect(schema).toBeDefined();
    // bad uuid + missing required agent fields
    expect(() =>
      schema?.parse({ agents: [{ id: "not-a-uuid" }], workflows: [] }),
    ).toThrow();
    // agents must be an array
    expect(() => schema?.parse({ agents: "nope", workflows: [] })).toThrow();
    // version must be a number, not a string
    expect(() =>
      schema?.parse({
        agents: [{ ...VALID.agents[0], version: "two" }],
        workflows: [],
      }),
    ).toThrow();
  });
});
