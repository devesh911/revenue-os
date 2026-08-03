// task-59 RED — criterion 4: the assertions engine is a MECHANICAL check (no LLM judging in v1).
// These are pure-function specs (no DB): they pin the exact pass/fail semantics of must_capture
// and expect_outcome, including the unhappy paths the criterion implies.
import { describe, expect, it } from "bun:test";
import { evaluateAssertions } from "./eval-runner";

describe("evaluateAssertions — must_capture (criterion 4)", () => {
  it("passes when every named field is present in what the agent captured", () => {
    const details = evaluateAssertions(
      { must_capture: ["budget_min", "preferred_location"] },
      {
        captured: { budget_min: 9000000, preferred_location: "Whitefield" },
        outcome: null,
      },
    );
    const byName = Object.fromEntries(details.map((d) => [d.name, d]));
    expect(byName.budget_min.kind).toBe("must_capture");
    expect(byName.budget_min.passed).toBe(true);
    expect(byName.preferred_location.passed).toBe(true);
  });

  it("fails the specific field that was never captured (per-field detail)", () => {
    const details = evaluateAssertions(
      { must_capture: ["budget_min", "preferred_location"] },
      { captured: { budget_min: 9000000 }, outcome: null },
    );
    const byName = Object.fromEntries(details.map((d) => [d.name, d]));
    expect(byName.budget_min.passed).toBe(true);
    expect(byName.preferred_location.passed).toBe(false);
  });

  it("treats a present-but-empty capture as NOT captured (null/'' do not count)", () => {
    const details = evaluateAssertions(
      { must_capture: ["preferred_location"] },
      { captured: { preferred_location: "" }, outcome: null },
    );
    expect(details[0].passed).toBe(false);
  });
});

describe("evaluateAssertions — expect_outcome (criterion 4)", () => {
  it("passes when the conversation's outcome equals the expected kind", () => {
    const details = evaluateAssertions(
      { expect_outcome: "site_visit_booked" },
      { captured: {}, outcome: "site_visit_booked" },
    );
    expect(details).toHaveLength(1);
    expect(details[0].kind).toBe("expect_outcome");
    expect(details[0].name).toBe("site_visit_booked");
    expect(details[0].passed).toBe(true);
  });

  it("fails when no outcome was produced", () => {
    const details = evaluateAssertions(
      { expect_outcome: "site_visit_booked" },
      { captured: {}, outcome: null },
    );
    expect(details[0].passed).toBe(false);
  });

  it("fails when the outcome is the wrong kind", () => {
    const details = evaluateAssertions(
      { expect_outcome: "site_visit_booked" },
      { captured: {}, outcome: "wrong_number" },
    );
    expect(details[0].passed).toBe(false);
  });
});

describe("evaluateAssertions — combined (criterion 4)", () => {
  it("emits one detail per must_capture field plus one for expect_outcome", () => {
    const details = evaluateAssertions(
      {
        must_capture: ["budget_min", "preferred_location"],
        expect_outcome: "site_visit_booked",
      },
      {
        captured: { budget_min: 9000000, preferred_location: "Whitefield" },
        outcome: "site_visit_booked",
      },
    );
    expect(details).toHaveLength(3);
    expect(details.every((d) => d.passed)).toBe(true);
  });
});
