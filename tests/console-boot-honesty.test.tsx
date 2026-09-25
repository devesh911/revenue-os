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
//   AC-R1 / AC-R2 — the task-21 refactor — landed; they stay as regression guards.
//   AC-R3 — the #49 behaviors — must STAY GREEN as regression guards. The sign-in front-door PR
//     (AC-C9) changed two of its OrgHomeView cases: EMPTY now reads "You're not in a workspace yet"
//     (RED until that lands), and ERROR passes the network ApiError the view now branches on.
//   AC-R4 — REPLACED by the sign-in front-door PR's rule-based check (AC-C10) over every file in
//     apps/console/src: the old three-file list named auth.tsx, which that PR retires.
// Env-free by construction (imitates tests/transcript-xss.test.tsx: bun test + renderToStaticMarkup,
// no DOM library, no DB/network; import.meta.env.VITE_* are undefined here). The lazy/memoize
// behavior is asserted with @supabase/supabase-js's createClient MOCKED, so no real client is ever
// built and the assertion needs no env. App-surface imports are per-test so each fails for its own
// reason. The createRoot/DOM mount and the with-env render branches of main.tsx are CI/e2e-owned.
import { afterAll, describe, expect, it, mock } from "bun:test";
import { apiFetch } from "@revenue-os/shared";
import { renderToStaticMarkup } from "react-dom/server";

// strip tags → visible text, so word assertions never match class names / attributes.
const visible = (html: string) => html.replace(/<[^>]*>/g, "");
// …with React's SSR apostrophe escape decoded, for copy like "You're …".
const readable = (html: string) => visible(html).replace(/&#x27;|&#39;/g, "'");
const API_BASE = "http://api.invalid.test:9999"; // sentinel the OrgHome error state must name
const noop = () => {};

// The error the shared apiFetch throws when the API can't be reached at all (the fetch rejects):
// an ApiError with status 0 once the sign-in front-door PR lands (a raw TypeError before it).
// (zod is not resolvable from tests/, so a pass-through schema stands in — apiFetch only calls parse.)
const anything = { parse: (x: unknown) => x } as unknown as Parameters<
  typeof apiFetch
>[2];
const networkError = (): Promise<unknown> =>
  apiFetch(API_BASE, "/orgs", anything, {
    fetchImpl: (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch,
  }).then(
    () => {
      throw new Error("expected apiFetch to reject for an unreachable API");
    },
    (error: unknown) => error,
  );

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

  // AC-R3 (updated for AC-C9) — OrgHomeView NETWORK error names the API base URL and reads as
  // unreachable, not empty. It now receives the error itself (the view tells "unreachable" from
  // other failures by it) plus the Retry / Sign out handlers.
  it("AC-R3: OrgHomeView NETWORK error names the API base URL and reads as unreachable, not empty", async () => {
    const { OrgHomeView } = await import("../apps/console/src/app/OrgHomeView");
    const html = renderToStaticMarkup(
      <OrgHomeView
        isLoading={false}
        isError={true}
        error={await networkError()}
        orgs={undefined}
        apiBase={API_BASE}
        onRetry={noop}
        onSignOut={noop}
      />,
    );
    expect(html).toContain(API_BASE);
    expect(visible(html)).toMatch(/reach/i); // "can't be reached" / "unreachable"
    expect(readable(html)).not.toContain("not in a workspace");
  });

  // AC-R3 (updated for AC-C9) — OrgHomeView EMPTY list reads as "not in a workspace yet" (the old
  // "No orgs yet — create one via the API" hint is gone: accounts are invite-only) — never an outage.
  it("AC-R3: OrgHomeView EMPTY reads 'You're not in a workspace yet', not an outage", async () => {
    const { OrgHomeView } = await import("../apps/console/src/app/OrgHomeView");
    const html = renderToStaticMarkup(
      <OrgHomeView
        isLoading={false}
        isError={false}
        error={null}
        orgs={[]}
        apiBase={API_BASE}
        onRetry={noop}
        onSignOut={noop}
      />,
    );
    expect(readable(html)).toContain("You're not in a workspace yet");
    expect(html).not.toContain("No orgs yet");
    expect(visible(html)).not.toMatch(/reach/i);
  });

  // AC-R3 — OrgHomeView LOADING is unchanged ("Loading orgs").
  it("AC-R3: OrgHomeView LOADING is unchanged ('Loading orgs')", async () => {
    const { OrgHomeView } = await import("../apps/console/src/app/OrgHomeView");
    const html = renderToStaticMarkup(
      <OrgHomeView
        isLoading={true}
        isError={false}
        error={null}
        orgs={undefined}
        apiBase={API_BASE}
        onRetry={noop}
        onSignOut={noop}
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

  // AC-C10 (replaces AC-R4) — rule-based, over EVERY file in apps/console/src rather than a fixed
  // list: (1) only lib/supabase.ts may import a runtime value from @supabase/supabase-js (type-only
  // imports are fine anywhere), so the lazy getter stays the single way a client gets built; (2) no
  // file calls getSupabase() at module scope (a column-0 call, or a top-level const/let/var
  // initializer), so importing any console module still builds nothing (boot honesty).
  it("AC-C10: only lib/supabase.ts value-imports @supabase/supabase-js, and nothing calls getSupabase() at module scope", async () => {
    const root = "apps/console/src";
    const files = [...new Bun.Glob("**/*.{ts,tsx}").scanSync(root)].sort();
    expect(files).toContain("lib/supabase.ts"); // the scan really covers the console source

    const valueImporters: string[] = [];
    const moduleScopeCallers: string[] = [];
    for (const f of files) {
      const src = await Bun.file(`${root}/${f}`).text();
      if (f !== "lib/supabase.ts" && valueImportsSupabase(src))
        valueImporters.push(f);
      if (callsGetSupabaseAtModuleScope(src)) moduleScopeCallers.push(f);
    }
    expect(valueImporters).toEqual([]);
    expect(moduleScopeCallers).toEqual([]);
  });

  // AC-C10 — the two rules actually bite: known-bad snippets are flagged, type-only ones are not
  // (so the scan above can't pass vacuously).
  it("AC-C10: the rule checks flag value imports and module-scope getSupabase() calls, not type-only use", () => {
    const S = "@supabase/supabase-js";
    expect(valueImportsSupabase(`import { createClient } from "${S}";`)).toBe(
      true,
    );
    expect(
      valueImportsSupabase(
        `import {\n  createClient,\n  type Session,\n} from "${S}";`,
      ),
    ).toBe(true);
    expect(valueImportsSupabase(`import * as supa from "${S}";`)).toBe(true);
    expect(valueImportsSupabase(`export { AuthError } from "${S}";`)).toBe(
      true,
    );
    expect(valueImportsSupabase(`const m = await import("${S}");`)).toBe(true);
    expect(valueImportsSupabase(`import "${S}";`)).toBe(true);
    expect(valueImportsSupabase(`import type { Session } from "${S}";`)).toBe(
      false,
    );
    expect(
      valueImportsSupabase(`import { type Session, type User } from "${S}";`),
    ).toBe(false);
    expect(
      valueImportsSupabase(
        `import { x } from "./other";\nimport type { Session } from "${S}";`,
      ),
    ).toBe(false);

    expect(
      callsGetSupabaseAtModuleScope(
        "getSupabase().auth.onAuthStateChange(cb);",
      ),
    ).toBe(true);
    expect(
      callsGetSupabaseAtModuleScope("const supabase = getSupabase();"),
    ).toBe(true);
    expect(
      callsGetSupabaseAtModuleScope("export const { auth } = getSupabase();"),
    ).toBe(true);
    expect(
      callsGetSupabaseAtModuleScope("let client =\n  getSupabase();"),
    ).toBe(true);
    expect(
      callsGetSupabaseAtModuleScope(
        "function f() {\n  return getSupabase();\n}",
      ),
    ).toBe(false);
    expect(
      callsGetSupabaseAtModuleScope("const f = () => getSupabase();"),
    ).toBe(false);
    expect(
      callsGetSupabaseAtModuleScope("export function getSupabase() {}"),
    ).toBe(false);
  });
});

// AC-C10 rule 1 — does this source import a RUNTIME value from @supabase/supabase-js? Static
// import/export-from clauses count unless they are `import type`/`export type` or every named
// specifier is `type`-qualified; bare side-effect imports and dynamic import() always count.
function valueImportsSupabase(src: string): boolean {
  const spec = `["']@supabase/supabase-js["']`;
  if (new RegExp(String.raw`\bimport\s*\(\s*${spec}\s*\)`).test(src))
    return true;
  if (new RegExp(String.raw`(^|[\n;])\s*import\s+${spec}`).test(src))
    return true;
  const fromClause = new RegExp(
    String.raw`(^|[\n;])\s*(?:import|export)\s+([^;"']*?)\s*from\s*${spec}`,
    "g",
  );
  for (const m of src.matchAll(fromClause)) {
    const clause = (m[2] ?? "").trim();
    if (/^type\b/.test(clause)) continue; // import type {…} / export type {…}
    const named = clause.match(/^\{([\s\S]*)\}$/)?.[1];
    const specifiers = named
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (specifiers?.length && specifiers.every((s) => /^type\s/.test(s)))
      continue; // import { type A, type B }
    return true;
  }
  return false;
}

// AC-C10 rule 2 — is getSupabase() called at module scope: a column-0 call, or a top-level
// (column-0) const/let/var whose initializer is a getSupabase() call?
function callsGetSupabaseAtModuleScope(src: string): boolean {
  return (
    /^(?:await\s+|void\s+)?getSupabase\s*\(/m.test(src) ||
    /^(?:export\s+)?(?:const|let|var)\s+[^=;]+=\s*(?:await\s+)?getSupabase\s*\(/m.test(
      src,
    )
  );
}
