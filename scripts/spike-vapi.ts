// Vapi API spike (task-8 residual, spec §12 risk #4) — verifies the account/key half of the
// integration WITHOUT a public webhook URL. Safe to re-run anytime (round-trips a scratch
// assistant, deletes it; creates nothing billable). Secrets: read from env (bun auto-loads
// .env), NEVER printed — every log line passes through redact().
//
//   bun scripts/spike-vapi.ts
//
// Exit nonzero on auth failure or a failed round-trip step.

const BASE = "https://api.vapi.ai";
const KEY = process.env.VAPI_API_KEY ?? "";
const WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET ?? "";

if (!KEY) {
  console.error("VAPI_API_KEY missing from env (.env) — nothing to spike.");
  process.exit(1);
}

function redact(s: string): string {
  let out = s;
  for (const secret of [KEY, WEBHOOK_SECRET]) {
    if (secret) out = out.replaceAll(secret, "[REDACTED]");
  }
  return out;
}
function log(label: string, value: unknown): void {
  console.log(redact(`${label}: ${JSON.stringify(value)}`));
}

async function api(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty/non-json body is fine */
  }
  return { status: res.status, body };
}

let failures = 0;

// ① Auth check — the cheapest authenticated read.
const assistants = await api("/assistant?limit=5");
log("auth.assistant-list", {
  status: assistants.status,
  count: Array.isArray(assistants.body)
    ? (assistants.body as unknown[]).length
    : null,
});
if (assistants.status === 401 || assistants.status === 403) {
  console.error(
    "Key rejected — check VAPI_API_KEY in .env (private key, not public).",
  );
  process.exit(1);
}
if (assistants.status !== 200) failures++;

// ② Phone-number + credential inventory (India path recon — expect empty lists pre-setup).
const phones = await api("/phone-number?limit=5");
log("phones.list", {
  status: phones.status,
  count: Array.isArray(phones.body) ? (phones.body as unknown[]).length : null,
});
const creds = await api("/credential?limit=5");
log("credentials.list", {
  status: creds.status,
  count: Array.isArray(creds.body) ? (creds.body as unknown[]).length : null,
});

// ③ Assistant round-trip with OUR server-secret shape (S6.2 exit criterion: the secret rides
//    assistant.server.secret and comes back to us as the x-vapi-secret header).
const scratch = {
  name: "revenue-os-spike-scratch (auto-deleted)",
  server: {
    url: "https://placeholder-until-vps.invalid/webhooks/vapi/00000000-0000-0000-0000-000000000000",
    ...(WEBHOOK_SECRET ? { secret: WEBHOOK_SECRET } : {}),
  },
};
const created = await api("/assistant", {
  method: "POST",
  body: JSON.stringify(scratch),
});
const createdId =
  created.status === 201 && created.body && typeof created.body === "object"
    ? (created.body as { id?: string }).id
    : undefined;
log("assistant.create", { status: created.status, id: createdId ?? null });
if (!createdId) {
  log("assistant.create.error", created.body);
  failures++;
} else {
  const fetched = await api(`/assistant/${createdId}`);
  const server =
    fetched.body && typeof fetched.body === "object"
      ? (fetched.body as { server?: { url?: string; secret?: string } }).server
      : undefined;
  log("assistant.get", {
    status: fetched.status,
    serverUrlStored: server?.url === scratch.server.url,
    secretEchoedBack: typeof server?.secret === "string", // finding: does GET expose it?
  });
  if (fetched.status !== 200) failures++;

  const deleted = await api(`/assistant/${createdId}`, { method: "DELETE" });
  log("assistant.delete", { status: deleted.status });
  if (deleted.status !== 200) failures++;
}

log("spike.result", { failures });
process.exit(failures === 0 ? 0 : 1);

export {}; // top-level await requires module context (TS1375)
