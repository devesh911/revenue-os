// How Slice 0's proof judges what the scripted fresh agent session says (scripts/proof/slice-0-agents.ts): that it
// named the item it is on, told apart from the slice's other items by the words only that item has, and that it
// answered the off-topic question about the worker's /ready endpoint as the code has it.
import { describe, expect, it } from "bun:test";
import { answersReady, namesItem, readyChecksDb } from "./proof/slice-0-agents";

// Slice 1's first three items as ROADMAP.md words them, cut short.
const ITEMS = [
  "For guardrail, tenancy and money code, the gate deliberately breaks each new line (flips a condition, removes a statement) and at least one test must then fail (agent)",
  "Every API route requires sign-in unless it is on a short public list, and accounts are really invite-only: the repo's sign-in settings turn self sign-up off (agent)",
  "Every link between company records (all 43, not only contacts, conversations and sequences), every duplicate-protection key and every call id is kept per company (agent)",
];
const [item = "", ...others] = ITEMS;

describe("naming the item it is on", () => {
  it("counts a short natural answer and a near quote, by the words only that item has", () => {
    for (const reply of [
      "Slice 1, the item that mutation-tests guardrail, tenancy and money code.",
      "We're on Slice 1: For guardrail, tenancy and money code, the gate deliberately breaks each new line.",
    ])
      expect(namesItem(reply, 1, item, others)).toBe(true);
  });

  it("does not count another item of the slice, another slice, or no item at all", () => {
    expect(
      namesItem(
        "Slice 1: every API route requires sign-in, accounts invite-only",
        1,
        item,
        others,
      ),
    ).toBe(false);
    expect(
      namesItem("Slice 2: guardrail, tenancy and money code", 1, item, others),
    ).toBe(false);
    expect(namesItem("Slice 1.", 1, item, others)).toBe(false);
  });

  // Four more of Slice 1's items, cut short: their titles share most of their words ("lead", "send", "never"), and
  // the first has no colon, so its whole long text is its title, "Slice" among its words.
  const DNC =
    "When a lead says \"don't contact me\" on a call, through a person in the console or in an imported list, it is recorded in the one place the guardrail check before every send reads, and every later message and call to them is blocked in every sequence, proven by a test where that lead's next send is refused; a block is lifted only by the lead's own written YES, which Slice 2 builds";
  const SENDS = [
    "No WhatsApp message goes to a lead without a recorded opt-in: CSV import and the API record the opt-in and where it came from, and the guardrail check before every send refuses a WhatsApp send to a lead whose opt-in is missing or withdrawn",
    "A call or WhatsApp send is never blindly repeated: the worker saves what it is about to send before calling the provider, never retries a dial or send automatically",
    "A lead's sequence never stops silently: when a call can't go ahead (a guardrail block, no active agent, the job failing) the lead is re-scheduled or handed to a person with the reason saved",
  ];

  it("counts a reply that quotes the start of its item's text, though that item's title shares its words with the others", () => {
    for (const [i, mine] of SENDS.entries()) {
      const rest = [...ITEMS, DNC, ...SENDS.filter((_, j) => j !== i)];
      expect(namesItem(`Slice 1. ${mine.slice(0, 160)}`, 1, mine, rest)).toBe(
        true,
      );
      for (const theirs of SENDS.filter((_, j) => j !== i))
        expect(
          namesItem(`Slice 1. ${theirs.slice(0, 160)}`, 1, mine, rest),
        ).toBe(false);
    }
  });

  it("counts a short title quoted whole, though the slice's other titles have every one of its words", () => {
    // Slice 3's item for the agent's tools, and three of its others.
    const tools =
      "Agent tools: read the lead's history, send WhatsApp, schedule the next touch, hand over to a person, save a memory";
    const rest = [
      "The AI's tools act only on the lead of the conversation they run in: a tool call can no longer name a lead, one that tries is rejected",
      "The company's approval setting is read before every agent action; an action that needs approval becomes a task for a person, never a silent drop",
      "After every event (reply, call ended, timer), the agent picks one next action with time, channel and reason",
    ];
    expect(namesItem("Slice 3: Agent tools", 3, tools, rest)).toBe(true);
    expect(
      namesItem(
        "Slice 3: the AI's tools act only on the lead of their conversation; a tool call can't name a lead",
        3,
        tools,
        rest,
      ),
    ).toBe(false);
  });
});

describe("what the worker's /ready endpoint checks, read from its code", () => {
  const today = `app.get("/ready", requireReadyToken(env.READY_TOKEN), (c) =>\n  c.json({ ok: true, todo: "db + pgboss checks (task 1)" }),\n);\n`;
  const later = `app.get("/ready", requireReadyToken(env.READY_TOKEN), async (c) => {\n  await db.query("select 1");\n  await boss.getQueues();\n  return c.json({ ok: true });\n});\n`;

  it("checks no database while its handler still answers with a todo, and does once that is gone", () => {
    expect(readyChecksDb(today)).toBe(false);
    expect(readyChecksDb(later)).toBe(true);
  });

  it("says the step needs updating when the worker has no /ready route", () => {
    expect(() => readyChecksDb('app.get("/health", ok);\n')).toThrow(
      "no /ready route",
    );
  });
});

describe("answering what the worker's /ready endpoint checks", () => {
  it("counts an answer naming its token, also when it says no replan is needed", () => {
    expect(
      answersReady(
        "It checks only the READY_TOKEN bearer token, then answers ok; the database and pg-boss checks are still a todo. No replan needed: it's just a question.",
        false,
      ),
    ).toBe(true);
  });

  it("does not count an answer that says it checks the database or pg-boss, one without the token, or a refusal", () => {
    for (const reply of [
      "It checks the database connection and that pg-boss is running.",
      "It requires the READY_TOKEN and checks the database and pg-boss.",
      "It returns ok.",
      "off-roadmap PR, or replan?",
    ])
      expect(answersReady(reply, false)).toBe(false);
  });

  it("once /ready checks the database, counts an answer saying so and not one that says it doesn't", () => {
    expect(
      answersReady(
        "It requires the READY_TOKEN, then checks the database and pg-boss.",
        true,
      ),
    ).toBe(true);
    for (const reply of [
      "It checks only the READY_TOKEN bearer token; the database and pg-boss checks are still a todo.",
      "It checks the database and pg-boss.",
    ])
      expect(answersReady(reply, true)).toBe(false);
  });
});
