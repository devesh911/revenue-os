// task-16 "console boot honesty" — RED spec. Every test here fails today: the eight that import
// a task-16 surface fail with a module-not-found error (those surfaces don't exist yet), and the
// boot-wiring sweep fails on a real assertion (nothing references the validator/screen yet). Per
// the brief that is the correct RED.
//
// Env-free by construction (imitates tests/transcript-xss.test.tsx: bun test +
// renderToStaticMarkup, no DOM library, no DB/network). The pure view + env modules the worker
// creates MUST stay side-effect-free at module scope — in particular they must NOT transitively
// import apps/console/src/lib/supabase.ts, whose module-scope createClient(import.meta.env…)
// throws "supabaseUrl is required." when no env is present. That throw IS the white-screen defect;
// a per-test `await import(...)` of a surface that re-introduced it would reject here, catching it.
// Imports are per-test (not top-level) so each test registers and fails for its own reason.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

// strip tags → visible text, so word assertions never match class names / attributes.
const visible = (html: string) => html.replace(/<[^>]*>/g, "");
const API_BASE = "http://api.invalid.test:9999"; // sentinel the OrgHome error state must name

describe("task-16 console boot honesty", () => {
  // AC1 — "Env validated at the boundary (Zod): … missing or empty … a pure, importable unit
  // … returning ok/missing-list." Missing AND empty are both reported, by variable name.
  it("AC1: parseConsoleEnv reports each required var that is missing or empty, by name", async () => {
    const { parseConsoleEnv } = await import("../apps/console/src/lib/env");

    const absent = parseConsoleEnv({});
    expect(absent.ok).toBe(false);
    if (absent.ok) throw new Error("expected not-ok when both vars absent");
    expect(absent.missing).toContain("VITE_SUPABASE_URL");
    expect(absent.missing).toContain("VITE_SUPABASE_ANON_KEY");

    const anonEmpty = parseConsoleEnv({
      VITE_SUPABASE_URL: "https://x.supabase.co",
      VITE_SUPABASE_ANON_KEY: "", // empty string counts as missing
    });
    expect(anonEmpty.ok).toBe(false);
    if (anonEmpty.ok) throw new Error("expected not-ok when a var is empty");
    expect(anonEmpty.missing).toContain("VITE_SUPABASE_ANON_KEY");
    expect(anonEmpty.missing).not.toContain("VITE_SUPABASE_URL");
  });

  // AC1 — "a readable configuration-error screen that (a) names each missing variable and
  // (b) points to apps/console/.env.example; no exception escapes to a white screen."
  it("AC1: ConfigErrorScreen names each missing var and points to apps/console/.env.example", async () => {
    const { ConfigErrorScreen } = await import(
      "../apps/console/src/app/ConfigErrorScreen"
    );
    const html = renderToStaticMarkup(
      <ConfigErrorScreen
        missing={["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]}
      />,
    );
    expect(html.length).toBeGreaterThan(0); // it renders — no exception escapes to a white screen
    expect(html).toContain("VITE_SUPABASE_URL");
    expect(html).toContain("VITE_SUPABASE_ANON_KEY");
    expect(html).toContain("apps/console/.env.example");
  });

  // AC1 — the validator + screen must actually sit on the boot path, else the white screen
  // persists. Static proxy for the runtime mount; the createRoot wiring itself is CI/e2e-owned.
  it("AC1: parseConsoleEnv and ConfigErrorScreen are wired into console src (not dead code)", async () => {
    const glob = new Bun.Glob("apps/console/src/**/*.{ts,tsx}");
    let usesParse = false;
    let usesScreen = false;
    for await (const path of glob.scan(".")) {
      if (
        path.endsWith("lib/env.ts") ||
        path.endsWith("app/ConfigErrorScreen.tsx")
      )
        continue;
      const src = await Bun.file(path).text();
      if (src.includes("parseConsoleEnv")) usesParse = true;
      if (src.includes("ConfigErrorScreen")) usesScreen = true;
    }
    expect(usesParse).toBe(true);
    expect(usesScreen).toBe(true);
  });

  // AC2 — "With both vars present, parsing succeeds and boot proceeds (the pure unit returns
  // ok; no error screen)."
  it("AC2: parseConsoleEnv returns ok and carries the values when both vars are present", async () => {
    const { parseConsoleEnv } = await import("../apps/console/src/lib/env");
    const res = parseConsoleEnv({
      VITE_SUPABASE_URL: "https://x.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon-key-123",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok when both vars are present");
    expect(res.env.VITE_SUPABASE_URL).toBe("https://x.supabase.co");
    expect(res.env.VITE_SUPABASE_ANON_KEY).toBe("anon-key-123");
  });

  // AC3 — "OrgHome: query ERROR renders a message that names the API base URL and says it
  // can't be reached (distinct from empty)".
  it("AC3: OrgHomeView ERROR names the API base URL and reads as unreachable, not empty", async () => {
    const { OrgHomeView } = await import("../apps/console/src/app/OrgHomeView");
    const html = renderToStaticMarkup(
      <OrgHomeView
        isLoading={false}
        isError={true}
        orgs={undefined}
        apiBase={API_BASE}
      />,
    );
    expect(html).toContain(API_BASE);
    expect(visible(html)).toMatch(/reach/i); // "can't be reached" / "unreachable"
    expect(html).not.toContain("No orgs yet");
  });

  // AC3 — "EMPTY list still renders the existing 'No orgs yet' text".
  it("AC3: OrgHomeView EMPTY still renders the existing 'No orgs yet' text", async () => {
    const { OrgHomeView } = await import("../apps/console/src/app/OrgHomeView");
    const html = renderToStaticMarkup(
      <OrgHomeView
        isLoading={false}
        isError={false}
        orgs={[]}
        apiBase={API_BASE}
      />,
    );
    expect(html).toContain("No orgs yet");
    expect(visible(html)).not.toMatch(/reach/i);
  });

  // AC3 — "loading unchanged."
  it("AC3: OrgHomeView LOADING is unchanged ('Loading orgs')", async () => {
    const { OrgHomeView } = await import("../apps/console/src/app/OrgHomeView");
    const html = renderToStaticMarkup(
      <OrgHomeView
        isLoading={true}
        isError={false}
        orgs={undefined}
        apiBase={API_BASE}
      />,
    );
    expect(html).toContain("Loading orgs");
  });

  // AC4 — "OrgSwitcher: query ERROR renders a distinct error indicator, NOT 'no orgs'."
  it("AC4: OrgSwitcherView ERROR shows a distinct error indicator, never 'no orgs'", async () => {
    const { OrgSwitcherView } = await import(
      "../apps/console/src/app/OrgSwitcherView"
    );
    const errHtml = renderToStaticMarkup(
      <OrgSwitcherView isLoading={false} isError={true} orgs={undefined} />,
    );
    const emptyHtml = renderToStaticMarkup(
      <OrgSwitcherView isLoading={false} isError={false} orgs={[]} />,
    );
    expect(errHtml).not.toContain("no orgs"); // a dead backend must not masquerade as empty
    expect(errHtml).not.toBe(emptyHtml); // visibly distinct from the empty state
    expect(visible(errHtml)).toMatch(
      /offline|error|unreachable|unavailable|failed/i,
    );
  });

  // AC4 (converse) — the EMPTY state is unchanged, proving error ≠ empty.
  it("AC4: OrgSwitcherView EMPTY still reads 'no orgs' (unchanged)", async () => {
    const { OrgSwitcherView } = await import(
      "../apps/console/src/app/OrgSwitcherView"
    );
    const html = renderToStaticMarkup(
      <OrgSwitcherView isLoading={false} isError={false} orgs={[]} />,
    );
    expect(html).toContain("no orgs");
  });
});
