// Console sign-in front door (RED) — fixed local ports. Sign-in redirects, the worker's CORS
// allowlist and VITE_API_URL all name concrete origins, so the dev servers must never drift to a
// "next free port" (strictPort) and Supabase auth must redirect back to the console, not :3000.
// Configs are imported per test so each test fails for its own reason.
import { describe, expect, it } from "bun:test";

type ServerOpts = { port?: number; strictPort?: boolean };
type ViteCfg = { server?: ServerOpts; preview?: ServerOpts };

const consoleConfig = async () =>
  (await import("../apps/console/vite.config")).default as ViteCfg;
const wwwConfig = async (): Promise<ViteCfg> => {
  const exported = (await import("../apps/www/vite.config")).default as
    | ViteCfg
    | ((env: Record<string, unknown>) => ViteCfg | Promise<ViteCfg>);
  return typeof exported === "function"
    ? await exported({
        command: "serve",
        mode: "development",
        isSsrBuild: false,
        isPreview: false,
      })
    : exported;
};
const authConfig = async () => {
  const mod = (await import("../supabase/config.toml")) as {
    default?: { auth?: Record<string, unknown> };
    auth?: Record<string, unknown>;
  };
  return (mod.default ?? mod).auth ?? {};
};

describe("fixed dev ports (vite)", () => {
  // AC-L5: the console dev server is pinned to 5173 and fails loudly instead of hopping ports.
  it("AC-L5: console dev server is 5173 with strictPort", async () => {
    const { server } = await consoleConfig();
    expect(server?.port).toBe(5173);
    expect(server?.strictPort).toBe(true);
  });

  // AC-L5: the console preview server is pinned to 4173 with strictPort.
  it("AC-L5: console preview server is 4173 with strictPort", async () => {
    const { preview } = await consoleConfig();
    expect(preview?.port).toBe(4173);
    expect(preview?.strictPort).toBe(true);
  });

  // AC-L5: the marketing site's dev server is pinned to 5174 so it never takes the console's 5173.
  it("AC-L5: www dev server is 5174 with strictPort", async () => {
    const { server } = await wwwConfig();
    expect(server?.port).toBe(5174);
    expect(server?.strictPort).toBe(true);
  });
});

describe("local Supabase auth redirects (supabase/config.toml)", () => {
  // AC-L6: auth's site URL is the console dev origin.
  it('AC-L6: [auth] site_url is "http://localhost:5173"', async () => {
    expect((await authConfig()).site_url).toBe("http://localhost:5173");
  });

  // AC-L6: auth may redirect back to the console dev and preview origins.
  it("AC-L6: additional_redirect_urls allow the console dev and preview origins", async () => {
    const urls = (await authConfig()).additional_redirect_urls as string[];
    expect(urls).toContain("http://localhost:5173/**");
    expect(urls).toContain("http://localhost:4173/**");
  });

  // AC-L6: nothing on the Supabase template's :3000 default survives.
  it("AC-L6: no auth redirect URL points at port 3000", async () => {
    const auth = await authConfig();
    const urls = (auth.additional_redirect_urls as string[] | undefined) ?? [];
    for (const u of [...urls, String(auth.site_url)]) {
      expect(u).not.toMatch(/:3000(\/|$)/);
    }
  });
});
