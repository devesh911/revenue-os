// task-21 "lazy getSupabase() singleton" — RED spec (adapts the task-16/#49 boot-honesty suite).
//
// Why this refactor: #49 had to keep apps/console/src/lib/supabase.ts OFF the static import graph,
// because its module-scope `export const supabase = createClient(import.meta.env…)` throws
// "supabaseUrl is required." at import when env is absent — so main.tsx DYNAMICALLY imported
// ./app/App behind the parseConsoleEnv gate (and needed a BootErrorScreen .catch). task-21 removes
// the fragility at its root: lib/supabase.ts constructs NOTHING at module scope and exports a lazy,
// memoized getSupabase(); main.tsx can then STATICALLY import App. The "keep supabase off the static
// graph" invariant is deleted.
//
// This file mixes RED and GREEN on purpose:
//   AC-R1 / AC-R2 / AC-R4 — the task-21 refactor — FAIL on today's code (source mismatch, or eager
//     module-scope construction) and pass once the worker lands the lazy getter + static import.
//   AC-R3 — the #49 behaviors — must STAY GREEN as regression guards.
// Env-free by construction (imitates tests/transcript-xss.test.tsx: bun test + renderToStaticMarkup,
// no DOM library, no DB/network; import.meta.env.VITE_* are undefined here). The lazy/memoize
// behavior is asserted with @supabase/supabase-js's createClient MOCKED, so no real client is ever
// built and the assertion needs no env. App-surface imports are per-test so each fails for its own
// reason. The createRoot/DOM mount and the with-env render branches of main.tsx are CI/e2e-owned.
import { afterAll, describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

// strip tags → visible text, so word assertions never match class names / attributes.
const visible = (html: string) => html.replace(/<[^>]*>/g, "");
const API_BASE = "http://api.invalid.test:9999"; // sentinel the OrgHome error state must name

describe("task-21 lazy getSupabase() singleton — console boot honesty", () => {
  // mock.module is process-global; restore so a full `bun test` run can't leak the fake createClient
  // into any other file that renders a supabase consumer.
  afterAll(() => {
    mock.restore();
  });

  // AC-R1 (source) — "lib/supabase.ts must perform NO createClient(...) at module-evaluation time …
  // exports getSupabase()". A module-scope call sits at column 0; a lazy one is indented inside the
  // getter. So: the eager `export const supabase = createClient` singleton is gone, no top-level
  // createClient call remains, and getSupabase is exported.
  it("AC-R1: lib/supabase.ts constructs no client at module scope and exports getSupabase (source)", async () => {
    const src = await Bun.file("apps/console/src/lib/supabase.ts").text();
    expect(src).not.toContain("export const supabase = createClient"); // today's eager singleton
    expect(src).not.toMatch(
      /^(export\s+)?(const|let|var)\s+\w+\s*=\s*createClient\s*\(/m,
    );
    expect(src).not.toMatch(/^createClient\s*\(/m);
    expect(src).toContain("getSupabase"); // the lazy getter callers use instead
  });

  // AC-R1 (behavioral, env-free with createClient mocked) — importing the module must construct
  // NOTHING (today's module-scope createClient runs at import → RED at not.toHaveBeenCalled),
  // getSupabase is a function, and it lazily builds AND memoizes ONE client (two calls → exactly one
  // createClient, and the SAME instance — the mock returns a fresh object per call so a non-memoizing
  // getter would return two distinct clients and fail).
  it("AC-R1: importing lib/supabase.ts (env unset) builds nothing until getSupabase(), then memoizes one client", async () => {
    let built = 0;
    const createClient = mock(() => ({ id: ++built }));
    mock.module("@supabase/supabase-js", () => ({ createClient }));

    const mod = (await import("../apps/console/src/lib/supabase")) as {
      getSupabase?: () => unknown;
    };
    expect(createClient).not.toHaveBeenCalled(); // lazy: importing constructs no client
    expect(typeof mod.getSupabase).toBe("function");

    const a = mod.getSupabase?.();
    const b = mod.getSupabase?.();
    expect(createClient).toHaveBeenCalledTimes(1); // built exactly once…
    expect(a).toBe(b); // …and memoized: same instance on every call
  });

  // AC-R2 (source) — main.tsx STATICALLY imports App (no dynamic import("./app/App")) now that
  // supabase.ts is import-safe, while KEEPING the parseConsoleEnv → ConfigErrorScreen gate. The
  // createRoot mount and the not-ok/ok render branches need a DOM + import.meta.env: CI/e2e-owned.
  it("AC-R2: main.tsx statically imports App and keeps the parseConsoleEnv → ConfigErrorScreen gate", async () => {
    const src = await Bun.file("apps/console/src/main.tsx").text();
    expect(src).toContain("parseConsoleEnv"); // env gate preserved
    expect(src).toContain("ConfigErrorScreen");
    expect(src).toMatch(
      /import\s+\{[^}]*\bApp\b[^}]*\}\s+from\s+["']\.\/app\/App["']/,
    ); // static import
    expect(src).not.toMatch(/import\s*\(\s*["']\.\/app\/App["']\s*\)/); // no dynamic import (today → RED)
  });

  // ── AC-R3: preserved #49 behaviors — regression guards, must STAY GREEN on today's code ──

  // AC-R3 — parseConsoleEnv reports each required var that is missing OR empty, by name.
  it("AC-R3: parseConsoleEnv reports each required var that is missing or empty, by name", async () => {
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

  // AC-R3 — ConfigErrorScreen names each missing var and points to apps/console/.env.example.
  it("AC-R3: ConfigErrorScreen names each missing var and points to apps/console/.env.example", async () => {
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

  // AC-R3 — with both vars present, parsing succeeds and carries the values (no error screen).
  it("AC-R3: parseConsoleEnv returns ok and carries the values when both vars are present", async () => {
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

  // AC-R3 — OrgHomeView ERROR names the API base URL and reads as unreachable, not empty.
  it("AC-R3: OrgHomeView ERROR names the API base URL and reads as unreachable, not empty", async () => {
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

  // AC-R3 — OrgHomeView EMPTY list still renders the existing "No orgs yet" text.
  it("AC-R3: OrgHomeView EMPTY still renders the existing 'No orgs yet' text", async () => {
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

  // AC-R3 — OrgHomeView LOADING is unchanged ("Loading orgs").
  it("AC-R3: OrgHomeView LOADING is unchanged ('Loading orgs')", async () => {
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

  // AC-R3 — OrgSwitcherView ERROR renders a distinct error indicator, NOT "no orgs".
  it("AC-R3: OrgSwitcherView ERROR shows a distinct error indicator, never 'no orgs'", async () => {
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

  // AC-R3 — OrgSwitcherView EMPTY still reads "no orgs" (unchanged), proving error ≠ empty.
  it("AC-R3: OrgSwitcherView EMPTY still reads 'no orgs' (unchanged)", async () => {
    const { OrgSwitcherView } = await import(
      "../apps/console/src/app/OrgSwitcherView"
    );
    const html = renderToStaticMarkup(
      <OrgSwitcherView isLoading={false} isError={false} orgs={[]} />,
    );
    expect(html).toContain("no orgs");
  });

  // AC-R4 (source) — every supabase consumer goes through the getter: auth.tsx, router.tsx and
  // lib/api.ts call getSupabase(); the bare module-level `supabase` binding (today's
  // `import { supabase }`) is gone from all three.
  it("AC-R4: auth.tsx, router.tsx and lib/api.ts call getSupabase() with no bare supabase binding", async () => {
    const files = [
      "apps/console/src/app/auth.tsx",
      "apps/console/src/app/router.tsx",
      "apps/console/src/lib/api.ts",
    ];
    for (const f of files) {
      const src = await Bun.file(f).text();
      expect(src).toContain("getSupabase("); // calls the lazy getter
      expect(src).not.toMatch(
        /^\s*import\s+(?:type\s+)?\{[^}]*\bsupabase\b[^}]*\}\s+from\b/m,
      );
    }
  });
});
