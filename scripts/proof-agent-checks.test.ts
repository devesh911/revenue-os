// How Slice 0's proof judges what the scripted fresh agent session says (scripts/proof/slice-0-agents.ts): that it
// named the item it is on, told apart from the slice's other items by the words only that item has, and that it
// answered the off-topic question about the worker's /ready endpoint as the code has it.
import { describe, expect, it } from "bun:test";
import { answersReady, namesItem } from "./proof/slice-0-agents";

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
});

describe("answering what the worker's /ready endpoint checks", () => {
  it("counts an answer naming its token, also when it says no replan is needed", () => {
    expect(
      answersReady(
        "It checks only the READY_TOKEN bearer token, then answers ok; the database and pg-boss checks are still a todo. No replan needed: it's just a question.",
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
      expect(answersReady(reply)).toBe(false);
  });
});
