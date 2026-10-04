// The console starts honestly: it builds its sign-in client only when first asked (src/lib/supabase.ts), names
// each missing setting instead of showing a blank page, and tells "the API can't be reached" apart from "you have
// no workspace". What it shows at start-up, all of its code loaded with the settings missing, is boot.test.tsx;
// that only src/lib/supabase.ts imports the Supabase client package is a lint rule (apps/console/biome.json).
import { afterAll, describe, expect, it, mock } from "bun:test";
import * as realSupabase from "@supabase/supabase-js";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfigErrorScreen } from "../src/app/ConfigErrorScreen";
import { OrgHomeView } from "../src/app/OrgHomeView";
import { OrgSwitcherView } from "../src/app/OrgSwitcherView";
import { parseConsoleEnv } from "../src/lib/env";
import { apiErrorFor, mockModule, text, visible } from "./test-utils";

const API_BASE = "http://api.invalid.test:9999"; // the address the landing's error state must name
const noop = () => {};

describe("the sign-in client is built lazily", () => {
  // The fake createClient lies over the real package, and afterAll puts the real one back for later files.
  let built = 0;
  const createClient = mock(() => ({ id: ++built }));
  const restore = mockModule("@supabase/supabase-js", realSupabase, {
    createClient,
  });
  afterAll(restore);

  // behaviour already on main: moved from tests/console-boot-honesty.test.tsx unchanged in what it checks
  it("importing src/lib/supabase.ts builds nothing until getSupabase(), then reuses one client", async () => {
    const { getSupabase } = await import("../src/lib/supabase");
    expect(createClient).not.toHaveBeenCalled();
    const a = getSupabase();
    const b = getSupabase();
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });
});

describe("the console's settings check", () => {
  // behaviour already on main: moved from tests/console-boot-honesty.test.tsx unchanged in what it checks
  it("reports each required setting that is missing or empty, by name", () => {
    const absent = parseConsoleEnv({});
    expect(absent.ok).toBe(false);
    if (absent.ok) throw new Error("expected not-ok when both are absent");
    expect(absent.missing).toContain("VITE_SUPABASE_URL");
    expect(absent.missing).toContain("VITE_SUPABASE_ANON_KEY");

    const anonEmpty = parseConsoleEnv({
      VITE_SUPABASE_URL: "https://x.supabase.co",
      VITE_SUPABASE_ANON_KEY: "", // empty counts as missing
    });
    expect(anonEmpty.ok).toBe(false);
    if (anonEmpty.ok) throw new Error("expected not-ok when one is empty");
    expect(anonEmpty.missing).toContain("VITE_SUPABASE_ANON_KEY");
    expect(anonEmpty.missing).not.toContain("VITE_SUPABASE_URL");
  });

  // behaviour already on main: moved from tests/console-boot-honesty.test.tsx unchanged in what it checks
  it("returns ok and carries the values when both are present", () => {
    const res = parseConsoleEnv({
      VITE_SUPABASE_URL: "https://x.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon-key-123",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok when both are present");
    expect(res.env.VITE_SUPABASE_URL).toBe("https://x.supabase.co");
    expect(res.env.VITE_SUPABASE_ANON_KEY).toBe("anon-key-123");
  });

  // behaviour already on main: moved from tests/console-boot-honesty.test.tsx unchanged in what it checks
  it("the configuration screen names each missing setting and points to apps/console/.env.example", () => {
    const html = renderToStaticMarkup(
      <ConfigErrorScreen
        missing={["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]}
      />,
    );
    expect(html).toContain("VITE_SUPABASE_URL");
    expect(html).toContain("VITE_SUPABASE_ANON_KEY");
    expect(html).toContain("apps/console/.env.example");
  });
});

describe("the landing tells an unreachable API apart from no workspace", () => {
  const landing = (props: Partial<Parameters<typeof OrgHomeView>[0]>) =>
    renderToStaticMarkup(
      <OrgHomeView
        isLoading={false}
        isError={false}
        error={null}
        orgs={undefined}
        apiBase={API_BASE}
        onRetry={noop}
        onSignOut={noop}
        {...props}
      />,
    );

  // behaviour already on main: moved from tests/console-boot-honesty.test.tsx unchanged in what it checks
  it("an unreachable API names its address and reads as unreachable, not empty", async () => {
    const html = landing({ isError: true, error: await apiErrorFor(0) });
    expect(html).toContain(API_BASE);
    expect(visible(html)).toMatch(/reach/i);
    expect(text(html)).not.toContain("not in a workspace");
  });

  // behaviour already on main: moved from tests/console-boot-honesty.test.tsx unchanged in what it checks
  it("an empty list reads 'You're not in a workspace yet', not an outage", () => {
    const html = landing({ orgs: [] });
    expect(text(html)).toContain("You're not in a workspace yet");
    expect(html).not.toContain("No orgs yet");
    expect(visible(html)).not.toMatch(/reach/i);
  });

  // behaviour already on main: moved from tests/console-boot-honesty.test.tsx unchanged in what it checks
  it("loading reads 'Loading orgs'", () => {
    expect(landing({ isLoading: true })).toContain("Loading orgs");
  });

  // behaviour already on main: moved from tests/console-boot-honesty.test.tsx unchanged in what it checks
  it("the workspace switcher shows a distinct error, never 'no orgs', and 'no orgs' when empty", () => {
    const errHtml = renderToStaticMarkup(
      <OrgSwitcherView isLoading={false} isError={true} orgs={undefined} />,
    );
    const emptyHtml = renderToStaticMarkup(
      <OrgSwitcherView isLoading={false} isError={false} orgs={[]} />,
    );
    expect(errHtml).not.toContain("no orgs");
    expect(errHtml).not.toBe(emptyHtml);
    expect(visible(errHtml)).toMatch(
      /offline|error|unreachable|unavailable|failed/i,
    );
    expect(emptyHtml).toContain("no orgs");
  });
});
