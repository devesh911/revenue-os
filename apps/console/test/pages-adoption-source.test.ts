// task-31 (wave 5 B) · B2-RED — SOURCE-LEVEL adoption pins for the Conversations, Transcript, and
// Contacts pages. ui/README's page skeleton is the contract: every data page is DataShell (owns the
// loading/error/empty branch) + the Table suite (owns the markup). The hand-rolled per-page TH/TD
// class CONSTANTS must be DELETED — a barrel import of TH/TD would TS2451-collide with a local
// `const TH`/`const TD`, so the two cannot coexist. These read each page's SOURCE and pin: DataShell
// (+ the Table parts on the two table pages) imported from the primitives barrel; the page renders
// via <DataShell> and <Table>…; the raw <table>/<thead> markup, the `const TH`/`const TD` constants,
// and the hand-rolled state-<p> ternary (className "text-sm text-muted") are gone. Transcript owns no
// table, so it pins DataShell only and KEEPS its exact custom copy.
//
// Env-free by construction (bun test + Bun.file text reads, CWD-relative from the worktree root —
// the tests/console-boot-honesty & apps/console/test/readme-coverage convention). RED today: the
// pages still hand-roll the ternary + <table> and declare `const TH`/`const TD`.
import { beforeAll, describe, expect, it } from "bun:test";

const CONVERSATIONS = "apps/console/src/pages/Conversations/index.tsx";
const CONTACTS = "apps/console/src/pages/Contacts/index.tsx";
const TRANSCRIPT = "apps/console/src/pages/Transcript/index.tsx";

// A name imported from the primitives barrel ("../../ui/primitives"). [^}]* stops at the first `}`,
// so the name must sit inside the ONE brace group that is immediately followed by that exact path —
// a name imported from any OTHER module (or declared as a `const`) never satisfies it.
const fromBarrel = (name: string): RegExp =>
  new RegExp(
    `import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*["']\\.\\./\\.\\./ui/primitives["']`,
  );

// The two table pages adopt the same skeleton, so their source pins are identical in shape.
function describeTablePageSource(title: string, path: string): void {
  describe(title, () => {
    let src: string;
    beforeAll(async () => {
      src = await Bun.file(path).text();
    });

    it("imports DataShell from the primitives barrel", () => {
      expect(src).toMatch(fromBarrel("DataShell"));
    });

    it("imports the Table suite (Table/THead/TH/Row/TD) from the primitives barrel", () => {
      for (const name of ["Table", "THead", "TH", "Row", "TD"]) {
        expect(src).toMatch(fromBarrel(name));
      }
    });

    it("renders via <DataShell> and the <Table> suite (no hand-rolled markup)", () => {
      expect(src).toMatch(/<DataShell\b/);
      expect(src).toMatch(/<Table\b/);
      expect(src).toMatch(/<THead\b/);
      expect(src).toMatch(/<TH\b/);
      expect(src).toMatch(/<Row\b/);
      expect(src).toMatch(/<TD\b/);
    });

    it("deletes the local `const TH` / `const TD` class constants (TS2451 collision rail)", () => {
      expect(src).not.toMatch(/const\s+TH\b/);
      expect(src).not.toMatch(/const\s+TD\b/);
    });

    it("drops the raw <table>/<thead> markup and the hand-rolled state-<p> ternary", () => {
      expect(src).not.toMatch(/<table\b/);
      expect(src).not.toMatch(/<thead\b/);
      // the loading/error/empty <p className="text-sm text-muted"> paragraphs DataShell replaces
      expect(src).not.toContain("text-sm text-muted");
    });
  });
}

describeTablePageSource(
  "task-31 source: Conversations adopts DataShell + Table (pages/Conversations/index.tsx)",
  CONVERSATIONS,
);

describeTablePageSource(
  "task-31 source: Contacts adopts DataShell + Table (pages/Contacts/index.tsx)",
  CONTACTS,
);

describe("task-31 source: Transcript adopts DataShell, keeps its custom copy (pages/Transcript/index.tsx)", () => {
  let src: string;
  beforeAll(async () => {
    src = await Bun.file(TRANSCRIPT).text();
  });

  it("imports DataShell from the primitives barrel", () => {
    expect(src).toMatch(fromBarrel("DataShell"));
  });

  it("renders via <DataShell> (no hand-rolled loading/error ternary)", () => {
    expect(src).toMatch(/<DataShell\b/);
    expect(src).not.toContain("text-sm text-muted");
  });

  // GREEN regression: Transcript's copy differs from DataShell's defaults, so the worker MUST pass
  // it through as loadingText/errorText — these strings must survive the migration verbatim.
  it("keeps its exact custom copy 'Loading transcript…' and 'Transcript unavailable.'", () => {
    expect(src).toContain("Loading transcript…");
    expect(src).toContain("Transcript unavailable.");
  });
});
