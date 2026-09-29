// Task 5 acceptance (project-spec §12): after `db:seed <pack>`, dispositions / pipelines /
// guardrails / agent v1 / workflow v1 / field definitions / eval personas exist — idempotently.
import { afterAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { type Pack, seed } from "./seed";

const admin = new pg.Pool({
  connectionString:
    process.env.LOCAL_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 2,
});
// Every workspace this file makes, and only those: other sessions share this database and use the
// dev login's seed-real-estate / seed-b2b-wholesale meanwhile, so the tests never seed or delete them.
const mine: string[] = [];

afterAll(async () => {
  await admin.query(
    `delete from orgs where id = any($1::uuid[]) and slug like 'seed-test-%'`,
    [mine],
  );
  await admin.end();
});

/** Seeds `pack` into a fresh workspace of this file's own; `again` re-seeds that same workspace. */
async function workspace(pack: Pack) {
  const slug = `seed-test-${randomUUID()}`;
  const again = () => seed(pack, slug);
  const { orgId } = await again();
  mine.push(orgId);
  return { orgId, again };
}

async function counts(orgId: string) {
  const q = async (sql: string) =>
    Number((await admin.query(sql, [orgId])).rows[0].n);
  return {
    dispositions: await q(
      `select count(*)::int n from dispositions where org_id = $1`,
    ),
    pipelines: await q(
      `select count(*)::int n from pipelines where org_id = $1`,
    ),
    stages: await q(
      `select count(*)::int n from pipeline_stages where org_id = $1`,
    ),
    fields: await q(
      `select count(*)::int n from field_definitions where org_id = $1`,
    ),
    guardrails: await q(
      `select count(*)::int n from guardrail_policies where org_id = $1`,
    ),
    agents: await q(
      `select count(*)::int n from agents where org_id = $1 and version = 1`,
    ),
    workflows: await q(
      `select count(*)::int n from workflows where org_id = $1 and version = 1`,
    ),
    personas: await q(
      `select count(*)::int n from eval_scenarios where org_id = $1`,
    ),
  };
}

describe("seed packs (db-design §9)", () => {
  it("real_estate pack populates the vertical template", async () => {
    const { orgId } = await workspace("real_estate");
    const c = await counts(orgId);
    expect(c.dispositions).toBe(7);
    expect(c.pipelines).toBe(1);
    expect(c.stages).toBe(6);
    expect(c.fields).toBe(5);
    expect(c.guardrails).toBe(4);
    expect(c.agents).toBe(1);
    expect(c.workflows).toBe(1);
    expect(c.personas).toBe(10);
  });

  it("b2b_wholesale pack populates the vertical template", async () => {
    const { orgId } = await workspace("b2b_wholesale");
    const c = await counts(orgId);
    expect(c.dispositions).toBe(7);
    expect(c.pipelines).toBe(1);
    expect(c.stages).toBe(6);
    expect(c.fields).toBe(4);
    expect(c.guardrails).toBe(4);
    expect(c.agents).toBe(1);
    expect(c.workflows).toBe(1);
    expect(c.personas).toBe(10);
  });

  it("re-seeding is idempotent (no duplicate template rows)", async () => {
    const { orgId, again } = await workspace("real_estate");
    const second = await again();
    expect(second.orgId).toBe(orgId);
    const c = await counts(orgId);
    expect(c.dispositions).toBe(7);
    expect(c.personas).toBe(10);
  });

  it("seeded agent v1 and workflow v1 are drafts (eval gate before activation — moat inv. 5)", async () => {
    const { orgId } = await workspace("real_estate");
    const r = await admin.query(
      `select (select status from agents where org_id = $1 and version = 1) as agent,
			        (select status from workflows where org_id = $1 and version = 1) as workflow`,
      [orgId],
    );
    expect(r.rows[0].agent).toBe("draft");
    expect(r.rows[0].workflow).toBe("draft");
  });

  it("seeds into the workspace it is given, not the pack's own", async () => {
    const { orgId } = await workspace("b2b_wholesale");
    const { slug } = (
      await admin.query(`select slug from orgs where id = $1`, [orgId])
    ).rows[0];
    expect(slug).toStartWith("seed-test-");
  });

  it("rejects unknown packs", async () => {
    expect(seed("not_a_pack" as never)).rejects.toThrow(/unknown pack/i);
  });
});

// Every row of a workspace in the tables the demo cleanup could reach, directly or by cascade.
const TABLES = [
  "contacts",
  "conversations",
  "messages",
  "tasks",
  "outcomes",
  "appointments",
  "contact_identities",
  "contact_memories",
  "contact_scores",
];
const rowIds = async (orgId: string) =>
  (
    await admin.query(
      `${TABLES.map((t) => `select '${t}:' || id from ${t} where org_id = $1`).join(" union all ")} order by 1`,
      [orgId],
    )
  ).rows;
const exists = async (table: string, id: string) =>
  (await admin.query(`select 1 from ${table} where id = $1`, [id])).rowCount;
const newOrg = async () => {
  const { id } = (
    await admin.query(
      `insert into orgs (name, slug) values ('Seed test — other workspace', $1) returning id`,
      [`seed-test-other-${randomUUID()}`],
    )
  ).rows[0];
  mine.push(id);
  return id as string;
};

// The console demo rows (contacts and their conversations, messages, tasks, outcomes). Before
// this was fixed every run inserted another full copy, so the dev login saw each person twice.
describe.each([
  "real_estate",
  "b2b_wholesale",
] as const)("re-seeding %s keeps one copy of the demo rows", (pack) => {
  const demo = async (orgId: string) =>
    (
      await admin.query(
        `select (select count(*)::int from contacts where org_id = $1) contacts,
                  (select count(*)::int from conversations where org_id = $1) conversations,
                  (select count(*)::int from messages where org_id = $1) messages,
                  (select count(*)::int from tasks where org_id = $1) tasks,
                  (select count(*)::int from outcomes where org_id = $1) outcomes,
                  (select max(n)::int from (select count(*) n from contacts where org_id = $1
                     group by first_name, last_name) p) max_copies`,
        [orgId],
      )
    ).rows[0];
  // The first demo person of a seeded workspace (the fixed-id row).
  const person = async (orgId: string) =>
    (
      await admin.query(
        `select id, first_name, last_name, source from contacts where org_id = $1 order by first_name limit 1`,
        [orgId],
      )
    ).rows[0];

  // A copy of a seeded person the old, non-idempotent seed left behind in `seedOrg`: same name and
  // source, another id, with the conversation, message, task and outcome that run made for it.
  const addCopy = async (seedOrg: string, into = seedOrg) => {
    const p = await person(seedOrg);
    const contact = (
      await admin.query(
        `insert into contacts (org_id, first_name, last_name, source) values ($1, $2, $3, $4) returning id`,
        [into, p.first_name, p.last_name, p.source],
      )
    ).rows[0].id as string;
    const conversation = await addHistory(into, contact);
    return { contact, conversation, seeded: p.id as string };
  };
  // A conversation (with one message), a task and an outcome that `org` owns for `contact`.
  const addHistory = async (org: string, contact: string) => {
    const v = await admin.query(
      `insert into conversations (org_id, contact_id, channel, direction, status)
         values ($1, $2, 'voice', 'inbound', 'completed') returning id`,
      [org, contact],
    );
    const conversation = v.rows[0].id as string;
    await admin.query(
      `insert into messages (org_id, conversation_id, seq, role, content) values ($1, $2, 1, 'agent', 'hi')`,
      [org, conversation],
    );
    await admin.query(
      `insert into tasks (org_id, contact_id, conversation_id, kind, title) values ($1, $2, $3, 'callback', 'call back')`,
      [org, contact, conversation],
    );
    await admin.query(
      `insert into outcomes (org_id, contact_id, conversation_id, kind, source) values ($1, $2, $3, 'qualified', 'agent')`,
      [org, contact, conversation],
    );
    return conversation;
  };

  it("seeding twice, plus a copy an older run left, ends with one row per seeded record — other workspaces untouched", async () => {
    const { orgId, again } = await workspace(pack);
    const once = await demo(orgId);
    expect(once).toEqual({
      contacts: 6,
      conversations: 4,
      messages: 13,
      tasks: 3,
      outcomes: 3,
      max_copies: 1,
    });
    const seededRows = await rowIds(orgId);
    await addCopy(orgId);

    // Another workspace holding the very same person: the seed must never touch it.
    const other = await newOrg();
    await addCopy(orgId, other);
    const otherBefore = await rowIds(other);

    await again();
    const last = await again();
    expect(last.orgId).toBe(orgId);
    expect(await demo(orgId)).toEqual(once);
    expect(await rowIds(orgId)).toEqual(seededRows); // same rows, same ids: links stay valid
    expect(await rowIds(other)).toEqual(otherBefore);
    expect(otherBefore).toHaveLength(5);
  });

  // Nothing in the schema stops a row of one workspace pointing at a contact or conversation of
  // another (the foreign keys are single-column), so the cleanup must not follow such a link out.
  it("rows another workspace links to the seeded people all survive a re-seed", async () => {
    const { orgId, again } = await workspace(pack);
    const other = await newOrg();
    // Old copies linked from the other workspace three ways, each alone: a message written into
    // the copy's conversation (a conversation delete cascades to it); the other workspace's own
    // conversation, task and outcome for the copy; an identity, memory and score (a contact
    // delete cascades to these). Plus the other workspace's history with the seeded person.
    const viaConversation = await addCopy(orgId);
    await admin.query(
      `insert into messages (org_id, conversation_id, seq, role, content) values ($1, $2, 2, 'agent', 'x')`,
      [other, viaConversation.conversation],
    );
    const viaHistory = await addCopy(orgId);
    await addHistory(other, viaHistory.contact);
    const viaProfile = await addCopy(orgId);
    await admin.query(
      `insert into contact_identities (org_id, contact_id, kind, value) values ($1, $2, 'email', $3)`,
      [other, viaProfile.contact, `${randomUUID()}@example.test`],
    );
    await admin.query(
      `insert into contact_memories (org_id, contact_id, kind, content, source_conversation_id)
         values ($1, $2, 'fact', 'x', $3)`,
      [other, viaProfile.contact, viaProfile.conversation],
    );
    await admin.query(
      `insert into contact_scores (org_id, contact_id, model_version, score) values ($1, $2, 'v1', 50)`,
      [other, viaProfile.contact],
    );
    await addHistory(other, viaProfile.seeded);
    const otherBefore = await rowIds(other);
    expect(otherBefore).toHaveLength(12);

    await again();
    expect(await rowIds(other)).toEqual(otherBefore);
    for (const copy of [viaConversation, viaHistory, viaProfile])
      expect(await exists("contacts", copy.contact)).toBe(1); // linked from outside: kept
  });

  // An existing local database can hold an old copy that later work picked up (a booked
  // appointment here). The seed used to stop on it with a foreign-key error.
  it("an old copy that other rows depend on is kept, and the seed still runs", async () => {
    const { orgId, again } = await workspace(pack);
    const copy = await addCopy(orgId);
    await admin.query(
      `insert into appointments (org_id, contact_id, kind, starts_at, ends_at, timezone)
         values ($1, $2, 'site_visit', now(), now() + interval '1 hour', 'Asia/Kolkata')`,
      [orgId, copy.contact],
    );
    const before = await rowIds(orgId);

    await again();
    expect(await rowIds(orgId)).toEqual(before);
  });
});
