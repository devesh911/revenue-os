// The console's API address (VITE_API_URL) is checked at start-up like its sign-in settings: a production build
// without a valid address names it on the configuration screen, instead of silently calling lib/api.ts's
// "http://localhost:8080" fallback and pointing real traffic at nowhere. Vite sets import.meta.env.PROD to true
// in production builds; in development the address stays optional, because that fallback is right for local work.
// parseConsoleEnv is pure and takes its settings as an argument, so these tests need no settings, page or network.
import { describe, expect, it } from "bun:test";
import { parseConsoleEnv } from "../src/lib/env";

// A valid sign-in pair, reused so each case isolates the API address and the build mode under test.
const SUPABASE = {
  VITE_SUPABASE_URL: "https://x.supabase.co",
  VITE_SUPABASE_ANON_KEY: "anon",
};

describe("the console's API address check — parseConsoleEnv depends on the build mode", () => {
  // The configuration screen (which renders `missing`) then names VITE_API_URL.
  // behaviour already on main: moved from tests/vite-api-url-honesty.test.tsx unchanged in what it checks
  it("a production build with VITE_API_URL absent → ok:false and missing names VITE_API_URL", () => {
    const res = parseConsoleEnv({ PROD: true, ...SUPABASE });
    expect(res.ok).toBe(false);
    if (res.ok)
      throw new Error("expected not-ok in PROD when VITE_API_URL absent");
    expect(res.missing).toContain("VITE_API_URL");
    // only the offending var is named — the two valid sign-in vars must NOT be flagged.
    expect(res.missing).not.toContain("VITE_SUPABASE_URL");
    expect(res.missing).not.toContain("VITE_SUPABASE_ANON_KEY");
  });

  // Present but invalid is as bad as absent (as VITE_SUPABASE_URL must be a URL and the anon key non-empty).
  // behaviour already on main: moved from tests/vite-api-url-honesty.test.tsx unchanged in what it checks
  it("a production build with a non-URL or empty VITE_API_URL → ok:false and missing names VITE_API_URL", () => {
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

  // behaviour already on main: moved from tests/vite-api-url-honesty.test.tsx unchanged in what it checks
  it("a production build with a valid VITE_API_URL → ok:true (no over-rejection)", () => {
    const res = parseConsoleEnv({
      PROD: true,
      ...SUPABASE,
      VITE_API_URL: "https://api.example.com",
    });
    expect(res.ok).toBe(true);
  });

  // PROD false and PROD absent both count as development; the second is what local work and the other start-up
  // tests rely on.
  // behaviour already on main: moved from tests/vite-api-url-honesty.test.tsx unchanged in what it checks
  it("a development build (PROD false or absent) with VITE_API_URL missing → ok:true", () => {
    const explicitDev = parseConsoleEnv({ PROD: false, ...SUPABASE });
    expect(explicitDev.ok).toBe(true);

    const prodAbsent = parseConsoleEnv({ ...SUPABASE });
    expect(prodAbsent.ok).toBe(true);
  });

  // behaviour already on main: moved from tests/vite-api-url-honesty.test.tsx unchanged in what it checks
  it("a production build still checks the two sign-in settings", () => {
    const res = parseConsoleEnv({
      PROD: true,
      VITE_API_URL: "https://api.example.com",
    });
    expect(res.ok).toBe(false);
    if (res.ok)
      throw new Error("expected not-ok in PROD when sign-in vars absent");
    expect(res.missing).toContain("VITE_SUPABASE_URL");
    expect(res.missing).toContain("VITE_SUPABASE_ANON_KEY");
    expect(res.missing).not.toContain("VITE_API_URL"); // valid here, so not flagged
  });
});
