// task-24 "VITE_API_URL boot honesty" — RED spec. Completes the boot-honesty arc (#49 supabase-url,
// #53 lazy-supabase, #54 render-boundary) for the one unvalidated var #53's review flagged: a
// deployed console missing VITE_API_URL silently bakes lib/api.ts's "http://localhost:8080" fallback
// and points production traffic at nowhere instead of failing loudly. The GREEN contract:
// parseConsoleEnv becomes PROD-aware via raw.PROD (vite injects import.meta.env.PROD=true in
// production builds, false/undefined in dev). In PROD, VITE_API_URL must be a valid URL (required);
// in DEV it stays OPTIONAL (the api.ts localhost fallback is correct for local dev). The two
// VITE_SUPABASE_* rules are unchanged in both modes.
//
// RED vs guard on today's code (today's ConsoleEnv has NO VITE_API_URL rule and ignores raw.PROD):
//   AC1, AC2 — FAIL now: safeParse ignores the extra keys, so it returns ok:true where the spec
//     demands ok:false. That is an ASSERTION mismatch (expected false, received true), NOT a
//     module/import error. They go GREEN once the worker lands the PROD-aware rule.
//   AC3, AC4 (+ the cross-mode supabase invariant) — PASS now, because today's code accepts
//     everything on the positive path. They are BOUNDARY GUARDS that pin the GREEN change against
//     OVER-rejection: a valid prod config, and the dev-optional path that local dev + the existing
//     console-boot-honesty suite depend on. They must STAY green through the worker's change.
// Env-free by construction (imitates tests/transcript-xss.test.tsx): parseConsoleEnv is pure and
// takes `raw` explicitly, so no import.meta.env, no DOM, no DB/network. No new table → no
// cross-tenant/RLS case applies.
import { describe, expect, it } from "bun:test";
import { parseConsoleEnv } from "../apps/console/src/lib/env";

// A valid supabase pair, reused so each case isolates the VITE_API_URL / PROD variable under test.
const SUPABASE = {
  VITE_SUPABASE_URL: "https://x.supabase.co",
  VITE_SUPABASE_ANON_KEY: "anon",
};

describe("task-24 VITE_API_URL boot honesty — parseConsoleEnv is PROD-aware", () => {
  // AC1 — "PROD requires VITE_API_URL": a production build with the var ABSENT must not boot; the
  // ConfigErrorScreen (which already renders `missing` names) then names VITE_API_URL instead of
  // silently baking the localhost fallback. RED today: safeParse ignores PROD + the absent key.
  it("AC1: PROD build with VITE_API_URL absent → ok:false and missing names VITE_API_URL", () => {
    const res = parseConsoleEnv({ PROD: true, ...SUPABASE });
    expect(res.ok).toBe(false);
    if (res.ok)
      throw new Error("expected not-ok in PROD when VITE_API_URL absent");
    expect(res.missing).toContain("VITE_API_URL");
    // only the offending var is named — the two valid supabase vars must NOT be flagged.
    expect(res.missing).not.toContain("VITE_SUPABASE_URL");
    expect(res.missing).not.toContain("VITE_SUPABASE_ANON_KEY");
  });

  // AC2 — "PROD garbage/empty VITE_API_URL caught": present-but-invalid is as bad as absent, so a
  // non-URL string and an empty string both fail in PROD (mirrors VITE_SUPABASE_URL .url() and
  // VITE_SUPABASE_ANON_KEY .min(1)). RED today: the extra key is ignored → ok:true.
  it("AC2: PROD build with a non-URL or empty VITE_API_URL → ok:false and missing names VITE_API_URL", () => {
    const garbage = parseConsoleEnv({
      PROD: true,
      ...SUPABASE,
      VITE_API_URL: "not-a-url",
    });
    expect(garbage.ok).toBe(false);
    if (garbage.ok)
      throw new Error("expected not-ok in PROD for a non-URL VITE_API_URL");
    expect(garbage.missing).toContain("VITE_API_URL");

    const empty = parseConsoleEnv({
      PROD: true,
      ...SUPABASE,
      VITE_API_URL: "",
    });
    expect(empty.ok).toBe(false);
    if (empty.ok)
      throw new Error("expected not-ok in PROD for an empty VITE_API_URL");
    expect(empty.missing).toContain("VITE_API_URL");
  });

  // AC3 (boundary guard, green today) — a PROD build WITH a valid VITE_API_URL passes. Pins the
  // GREEN change against over-rejecting a correctly-configured production deploy.
  it("AC3: PROD build with a valid VITE_API_URL → ok:true (no over-rejection)", () => {
    const res = parseConsoleEnv({
      PROD: true,
      ...SUPABASE,
      VITE_API_URL: "https://api.example.com",
    });
    expect(res.ok).toBe(true);
  });

  // AC4 (boundary guard, green today) — DEV keeps VITE_API_URL OPTIONAL so the api.ts localhost
  // fallback stays correct locally. PROD:false AND PROD absent/undefined both count as dev; the
  // second shape is exactly what the existing console-boot-honesty suite + local dev rely on.
  it("AC4: DEV build (PROD:false or absent) with VITE_API_URL missing → ok:true", () => {
    const explicitDev = parseConsoleEnv({ PROD: false, ...SUPABASE });
    expect(explicitDev.ok).toBe(true);

    const prodAbsent = parseConsoleEnv({ ...SUPABASE });
    expect(prodAbsent.ok).toBe(true);
  });

  // Design invariant (boundary guard, green today) — "the two VITE_SUPABASE_* rules are UNCHANGED
  // in both modes": a PROD build missing the supabase vars still flags THEM (and not a valid
  // VITE_API_URL). Guards the GREEN refactor against dropping the supabase checks on the PROD path.
  it("invariant: PROD build still enforces the VITE_SUPABASE_* rules unchanged", () => {
    const res = parseConsoleEnv({
      PROD: true,
      VITE_API_URL: "https://api.example.com",
    });
    expect(res.ok).toBe(false);
    if (res.ok)
      throw new Error("expected not-ok in PROD when supabase vars absent");
    expect(res.missing).toContain("VITE_SUPABASE_URL");
    expect(res.missing).toContain("VITE_SUPABASE_ANON_KEY");
    expect(res.missing).not.toContain("VITE_API_URL"); // valid here, so not flagged
  });
});
