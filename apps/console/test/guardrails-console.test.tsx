// task-52 RED — console Guardrails wiring: the features/guardrails/api.ts hooks and the Settings
// "Guardrails" section. Env-free by construction (bun test + renderToStaticMarkup, no DOM library,
// no DB/network, no new deps) — the two source-pin describes read the files as text (the repo's
// established RED idiom, imitates pages-adoption-*), and the behavior describes render the real
// SettingsPage with its two server-state hooks MOCKED via mock.module (process-global, so afterAll
// restores). Interaction (an actual submit event) is NOT reachable without a DOM/interaction lib
// (a new dep, forbidden), so "submit fires the PUT" is pinned at the source layer (useMutation +
// PUT + invalidateQueries) — see report.
import { afterAll, describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router } from "wouter";
import * as realOrgsApi from "../src/features/orgs/api";

const ORG = "11111111-1111-4111-8111-111111111111";
const orgFixture = { id: ORG, name: "Acme Co", slug: "acme", role: "admin" };

// The four seeded policies (real_estate.sql:45-48) as the query's happy payload.
const policies = [
  {
    key: "quiet_hours",
    config: { start: "21:00", end: "09:00", tz: "contact" },
    active: true,
    updated_at: "2026-07-01T00:00:00Z",
  },
  {
    key: "attempt_caps",
    config: {
      voice: { max: 3, per_hours: 72 },
      whatsapp: { max: 2, per_hours: 24 },
    },
    active: true,
    updated_at: "2026-07-01T00:00:00Z",
  },
  {
    key: "dnc",
    config: { hard_stop: true },
    active: true,
    updated_at: "2026-07-01T00:00:00Z",
  },
  {
    key: "autonomy",
    config: { book_appointment: "auto", send_quote: "approval" },
    active: true,
    updated_at: "2026-07-01T00:00:00Z",
  },
];

const loadingState = { isLoading: true, isError: false, data: undefined };
const errorState = { isLoading: false, isError: true, data: undefined };
const ok = (data: unknown) => ({ isLoading: false, isError: false, data });

// SettingsPage reads these live via the mocked hooks. orgs is pinned happy so OrganizationCard
// renders cleanly and never contributes the strings the guardrail assertions look for.
let guardrailsResult: unknown = loadingState;
mock.module("../src/features/orgs/api", () => ({
  ...realOrgsApi,
  useOrgsQuery: () => ok([orgFixture]),
}));
// guardrails/api.ts does not exist at RED time — a virtual, non-spreading mock (only this file and
// the sanctioned pages-adoption edit consume it, each sets its own). Exposes exactly the two hooks
// SettingsPage will call.
mock.module("../src/features/guardrails/api", () => ({
  useGuardrailPoliciesQuery: () => guardrailsResult,
  useUpdateGuardrailPolicy: () => ({ mutate: () => {}, isPending: false }),
  queryKeys: {
    guardrailPolicies: (orgId: string) => ["guardrail-policies", orgId],
  },
}));

afterAll(() => {
  mock.restore();
});

const text = (html: string): string =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

async function renderSettings(): Promise<string> {
  const { SettingsPage } = await import("../src/pages/Settings/index");
  return renderToStaticMarkup(
    <Router ssrPath={`/o/${ORG}/settings`}>
      <Route path="/o/:orgId/settings">
        <SettingsPage />
      </Route>
    </Router>,
  );
}

// The repo RED idiom: read source as text; catch-to-empty so a missing file fails as a clean
// assertion (`expect("").toContain(…)`), never a thrown ENOENT.
const GUARDRAILS_API = "apps/console/src/features/guardrails/api.ts";
const SETTINGS_SRC = "apps/console/src/pages/Settings/index.tsx";
const readSrc = async (p: string): Promise<string> => {
  try {
    return await Bun.file(p).text();
  } catch {
    return "";
  }
};

describe("features/guardrails/api.ts — hooks contract (source)", () => {
  it("exports useGuardrailPoliciesQuery + useUpdateGuardrailPolicy", async () => {
    const src = await readSrc(GUARDRAILS_API);
    expect(src).toMatch(/export (function|const) useGuardrailPoliciesQuery/);
    expect(src).toMatch(/export (function|const) useUpdateGuardrailPolicy/);
  });

  it("query GETs the org-scoped /guardrail-policies endpoint via useQuery", async () => {
    const src = await readSrc(GUARDRAILS_API);
    expect(src).toContain("/guardrail-policies");
    expect(src).toMatch(/useQuery/);
  });

  it("mutation PUTs and validates its body with the shared GuardrailPolicyInputSchema", async () => {
    const src = await readSrc(GUARDRAILS_API);
    expect(src).toMatch(/useMutation/);
    expect(src).toMatch(/method:\s*["']PUT["']/);
    expect(src).toContain("@revenue-os/shared");
    expect(src).toContain("GuardrailPolicyInputSchema");
  });

  it("mutation invalidates the guardrail-policies query key on success", async () => {
    const src = await readSrc(GUARDRAILS_API);
    expect(src).toMatch(/useQueryClient/);
    expect(src).toMatch(/invalidateQueries/);
    expect(src).toMatch(/onSuccess/);
  });
});

describe("Settings page — wires the live Guardrails section (source)", () => {
  it("drops the dead 'hasn't shipped' placeholder copy", async () => {
    const src = await readSrc(SETTINGS_SRC);
    expect(src).not.toContain("will live here");
    expect(src).not.toContain("backend wave");
    expect(src).not.toContain("hasn't shipped");
  });

  it("consumes the guardrail-policies query hook", async () => {
    expect(await readSrc(SETTINGS_SRC)).toContain("useGuardrailPoliciesQuery");
  });
});

describe("Settings Guardrails section — honest data states", () => {
  it("loading → calm 'Loading…'", async () => {
    guardrailsResult = loadingState;
    expect(text(await renderSettings())).toContain("Loading…");
  });

  it("error → an 'Unable to load' state, never silent", async () => {
    guardrailsResult = errorState;
    expect(text(await renderSettings())).toContain("Unable to load");
  });

  it("a fresh org with zero policies is honest: no fabricated config, no dead placeholder", async () => {
    guardrailsResult = ok({ policies: [] });
    const html = await renderSettings();
    expect(html).not.toContain("21:00"); // nothing invented when there's no data
    expect(text(html)).not.toContain("will live here"); // dead placeholder is gone
  });
});

describe("Settings Guardrails section — renders each policy, editable vs read-only", () => {
  it("renders all four policies (tolerant of humanized labels)", async () => {
    guardrailsResult = ok({ policies });
    const t = text(await renderSettings()).toLowerCase();
    expect(t).toMatch(/quiet.?hours/);
    expect(t).toMatch(/attempt.?caps|attempts/);
    expect(t).toMatch(/dnc|do not contact/);
    expect(t).toMatch(/autonomy/);
  });

  it("quiet_hours is EDITABLE: a form bound to the live start value + a submit control", async () => {
    guardrailsResult = ok({ policies });
    const html = await renderSettings();
    expect(html).toContain("<form");
    expect(html).toContain('value="21:00"'); // current start rendered in an editable input
    expect(html).toContain('type="submit"');
  });

  it("autonomy is EDITABLE: a <select> offering the tier, current tier shown", async () => {
    guardrailsResult = ok({ policies });
    const html = await renderSettings();
    expect(html).toContain("<select");
    expect(html).toContain("approval"); // the seeded send_quote tier
  });

  it("exactly two policies are editable (quiet_hours + autonomy expose a submit)", async () => {
    guardrailsResult = ok({ policies });
    const html = await renderSettings();
    expect((html.match(/type="submit"/g) ?? []).length).toBe(2);
  });

  it("attempt_caps + dnc are READ-ONLY: values shown as text, never as editable inputs", async () => {
    guardrailsResult = ok({ policies });
    const html = await renderSettings();
    const t = text(html);
    expect(t).toContain("voice"); // attempt_caps channels visible (read-only)
    expect(t).toContain("whatsapp");
    expect(html).not.toContain('value="72"'); // not an editable per_hours input
    expect(html).not.toContain('value="24"');
  });
});
