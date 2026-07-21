// groupBySection contract (routes.tsx: "new section name → new group, order of first
// appearance") — grouping is by section NAME globally, not by adjacency. Guards the
// page fan-out: appended routes land at the manifest anchor and are never reordered,
// so a "Workspace" page appended AFTER the "Insights" entry must merge into the
// existing Workspace group — 2 groups with unique keys, not a duplicate "WORKSPACE"
// header + React duplicate-key warning (review #58, defect 2). Env-free by
// construction: pure function, no DOM, no DB/network, no new deps.
import { describe, expect, it } from "bun:test";
import { groupBySection, type SidebarNavEntry } from "../src/ui/layout/Sidebar";

const entry = (path: string, section: string): SidebarNavEntry => ({
  path,
  label: path,
  icon: "home",
  section,
});

describe("Sidebar groupBySection", () => {
  it("merges a non-adjacent same-section route into the existing group (2 groups, not 3)", () => {
    const groups = groupBySection([
      entry("home", "Workspace"),
      entry("dashboard", "Insights"),
      entry("settings", "Workspace"), // appended at the anchor, after Insights
    ]);
    expect(groups.length).toBe(2); // NOT 3 — no duplicate Workspace group
    expect(groups[0]?.section).toBe("Workspace");
    expect(groups[0]?.items.map((i) => i.path)).toEqual(["home", "settings"]);
    expect(groups[1]?.section).toBe("Insights");
    expect(groups[1]?.items.map((i) => i.path)).toEqual(["dashboard"]);
  });

  it("keeps today's manifest shape: adjacent same-section runs stay one group, order of first appearance", () => {
    const groups = groupBySection([
      entry("home", "Workspace"),
      entry("tasks", "Workspace"),
      entry("dashboard", "Insights"),
    ]);
    expect(groups.map((g) => g.section)).toEqual(["Workspace", "Insights"]);
    expect(groups[0]?.items.map((i) => i.path)).toEqual(["home", "tasks"]);
    expect(groups[1]?.items.map((i) => i.path)).toEqual(["dashboard"]);
  });

  it("section names stay unique across groups (safe as React keys)", () => {
    const groups = groupBySection([
      entry("a", "Workspace"),
      entry("b", "Insights"),
      entry("c", "Workspace"),
      entry("d", "Insights"),
    ]);
    const sections = groups.map((g) => g.section);
    expect(new Set(sections).size).toBe(sections.length);
    expect(groups.length).toBe(2);
  });
});
