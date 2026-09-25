// Playwright global setup for the auth spec (auth.e2e.ts). Runs AFTER the webServers are up: seeds
// the real_estate pack with the developer's own `bun run db:seed` (which also makes the dev login its
// admin), then asks the worker which workspace the console's '/' landing will open — the FIRST of
// GET /orgs — and exports it as E2E_ORG_ID / E2E_ORG_NAME (test workers inherit process.env).
// The seed runs as a Bun child because seed.ts is Bun-only (`import.meta`), and Playwright is Node.
// No stack env (`--list`, or the boot smoke on its own) → it does nothing, and the auth tests fail
// with their own "must be set" error.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { z } from "zod";
import {
  DEV_LOGIN_EMAIL,
  DEV_LOGIN_PASSWORD,
} from "../../../scripts/dev-login";

const TokenResponse = z.object({ access_token: z.string().min(1) });
const OrgsResponse = z.array(z.object({ id: z.uuid(), name: z.string() }));

export default async function globalSetup(): Promise<void> {
  const {
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: anonKey,
    VITE_API_URL: apiUrl,
  } = process.env;
  if (!supabaseUrl || !anonKey || !apiUrl) return;

  // stdout ignored: the seed CLI prints the dev login line, and it has no place in test output.
  execFileSync("bun", ["run", "db:seed", "real_estate"], {
    cwd: resolve(__dirname, "../../.."),
    stdio: ["ignore", "ignore", "inherit"],
  });

  // GoTrue password grant: the dev login's access token stays in memory, never printed.
  const tokenRes = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { "content-type": "application/json", apikey: anonKey },
      body: JSON.stringify({
        email: DEV_LOGIN_EMAIL,
        password: DEV_LOGIN_PASSWORD,
      }),
    },
  );
  if (!tokenRes.ok)
    throw new Error(`dev login sign-in failed: HTTP ${tokenRes.status}`);
  const { access_token } = TokenResponse.parse(await tokenRes.json());

  const orgsRes = await fetch(`${apiUrl}/orgs`, {
    headers: { authorization: `Bearer ${access_token}` },
  });
  if (!orgsRes.ok) throw new Error(`GET /orgs failed: HTTP ${orgsRes.status}`);
  const [first] = OrgsResponse.parse(await orgsRes.json());
  if (!first) throw new Error("GET /orgs: the dev login is in no workspace");
  process.env.E2E_ORG_ID = first.id;
  process.env.E2E_ORG_NAME = first.name;
}
