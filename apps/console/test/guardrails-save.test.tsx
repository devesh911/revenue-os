// Loading and saving guardrails from Settings, through the hooks the Settings page calls (features/guardrails/api.ts):
// the policies are fetched with a GET of the company's guardrail-policies address, signed in; the save sends a PUT
// of the policy, checked first against the shared schema the worker's route also parses, to the same address with
// the signed-in person's token, then marks the policies the page shows as out of date, so the page fetches them
// again. A policy that fails the schema never leaves the browser, and a save the
// worker refuses refreshes nothing. Only the network and the sign-in session are faked; the hooks, the API client
// and the shared schema are the real ones. The same save in a real browser is Slice 1's browser-check item.
import { afterAll, afterEach, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import {
  useGuardrailPoliciesQuery,
  useUpdateGuardrailPolicy,
} from "../src/features/guardrails/api";
import * as realSupabase from "../src/lib/supabase";
import { mockModule } from "./test-utils";

const ORG = "11111111-1111-4111-8111-111111111111";
const restoreSupabase = mockModule("../src/lib/supabase", realSupabase, {
  getSupabase: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "signed-in-token" } },
      }),
    },
  }),
});
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
afterAll(restoreSupabase);

/** Fakes the network: records each request and answers with `status` and `body`. */
function network(status: number, body: unknown) {
  const sent: { path: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ path: new URL(url).pathname, init });
    return Response.json(body, { status });
  }) as unknown as typeof fetch;
  return sent;
}

/** The Settings page's two guardrail hooks, as one render of a page using them leaves them. */
function settingsHooks() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } },
  });
  let save: ReturnType<typeof useUpdateGuardrailPolicy> | undefined;
  function Probe() {
    useGuardrailPoliciesQuery(ORG);
    save = useUpdateGuardrailPolicy(ORG);
    return null;
  }
  renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
  const [shown] = client.getQueryCache().getAll();
  if (!save || !shown) throw new Error("the hooks did not render");
  return { save, shown };
}

const QUIET_HOURS = {
  key: "quiet_hours",
  config: { start: "21:00", end: "09:00", tz: "contact" },
};
const SAVED = {
  policy: {
    ...QUIET_HOURS,
    active: true,
    updated_at: "2026-10-03T00:00:00Z",
  },
};

// behaviour already on main: main's guardrail hooks already do this; it replaces tests that read their file as text (docs/removed-tests.md)
it("the policies the page shows are fetched from the company's guardrails, signed in", async () => {
  const sent = network(200, { policies: [SAVED.policy] });
  const { shown } = settingsHooks();

  expect(await shown.fetch()).toEqual({ policies: [SAVED.policy] });
  expect(sent).toHaveLength(1);
  const [request] = sent;
  expect(request?.path).toBe(`/orgs/${ORG}/guardrail-policies`);
  expect(request?.init.method ?? "GET").toBe("GET");
  expect(new Headers(request?.init.headers).get("authorization")).toBe(
    "Bearer signed-in-token",
  );
});

// behaviour already on main: main's guardrail hooks already do this; it replaces tests that read their file as text (docs/removed-tests.md)
it("a save sends a PUT of the checked policy, signed in, to the company's guardrails, then refreshes what the page shows", async () => {
  const sent = network(200, SAVED);
  const { save, shown } = settingsHooks();
  expect(shown.state.isInvalidated).toBe(false);

  expect(await save.mutateAsync(QUIET_HOURS)).toEqual(SAVED);

  expect(sent).toHaveLength(1);
  const [request] = sent;
  expect(request?.path).toBe(`/orgs/${ORG}/guardrail-policies`);
  expect(request?.init.method).toBe("PUT");
  expect(new Headers(request?.init.headers).get("authorization")).toBe(
    "Bearer signed-in-token",
  );
  // The shared schema's parse, sent: its default fills in `active`.
  expect(JSON.parse(String(request?.init.body))).toEqual({
    ...QUIET_HOURS,
    active: true,
  });
  expect(shown.state.isInvalidated).toBe(true);
});

// behaviour already on main: main's guardrail hooks already do this; it replaces tests that read their file as text (docs/removed-tests.md)
it("a policy the shared schema refuses never leaves the browser, and nothing is refreshed", async () => {
  const sent = network(200, SAVED);
  const { save, shown } = settingsHooks();

  for (const bad of [
    { ...QUIET_HOURS, config: { ...QUIET_HOURS.config, start: "9pm" } },
    { key: "quiet_hours" },
    {},
  ])
    await expect(save.mutateAsync(bad)).rejects.toThrow();
  expect(sent).toEqual([]);
  expect(shown.state.isInvalidated).toBe(false);
});

// behaviour already on main: main's guardrail hooks already do this; it replaces tests that read their file as text (docs/removed-tests.md)
it("a save the worker refuses fails with its reason, and nothing is refreshed", async () => {
  const sent = network(400, { error: "invalid_config" });
  const { save, shown } = settingsHooks();

  await expect(save.mutateAsync(QUIET_HOURS)).rejects.toMatchObject({
    status: 400,
  });
  expect(sent).toHaveLength(1);
  expect(shown.state.isInvalidated).toBe(false);
});
