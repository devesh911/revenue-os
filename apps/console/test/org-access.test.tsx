// Console sign-in front door — RED spec for what a signed-in person sees around workspaces.
//   - orgAccess decides, from the person's own workspace list, whether an /o/:orgId URL is
//     theirs: still loading, a member, or no access (including ids that aren't even uuids).
//     NoAccessView says so plainly, links to the workspaces they DO have, and offers sign-out.
//   - OrgHomeView, the landing after sign-in, is honest about the three non-happy states:
//     no workspace yet (invite-only, so: ask your admin), the API unreachable (names the API
//     base, as today), and any other failure — each with a way forward (Retry / Sign out).
// Env-free SSR (renderToStaticMarkup inside the static wouter harness); modules load per test.
import { describe, expect, it } from "bun:test";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "./router";
import { apiErrorFor, buttons, text } from "./test-utils";

type Org = {
  id: string;
  name: string;
  slug: string;
  role: "admin" | "operator" | "viewer";
};
type Access = "loading" | "member" | "no-access";

const ORG_A: Org = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Acme Realty",
  slug: "acme",
  role: "admin",
};
const ORG_B: Org = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Beta Homes",
  slug: "beta",
  role: "viewer",
};
const FOREIGN = "00000000-0000-4000-8000-000000000000";
const API_BASE = "http://api.invalid.test:9999";
const noop = () => {};

const loadOrgAccess = async () =>
  (
    (await import("../src/app/access/org-access")) as {
      orgAccess: (
        orgId: string,
        orgs: { id: string }[] | undefined,
        isLoading: boolean,
      ) => Access;
    }
  ).orgAccess;

type OrgHomeViewProps = {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  orgs: Org[] | undefined;
  apiBase: string;
  onRetry: () => void;
  onSignOut: () => void;
};

async function renderOrgHome(over: Partial<OrgHomeViewProps>): Promise<string> {
  const { OrgHomeView } = (await import("../src/app/OrgHomeView")) as {
    OrgHomeView: ComponentType<OrgHomeViewProps>;
  };
  return renderToStaticMarkup(
    <StaticRouter>
      <OrgHomeView
        isLoading={false}
        isError={false}
        error={null}
        orgs={undefined}
        apiBase={API_BASE}
        onRetry={noop}
        onSignOut={noop}
        {...over}
      />
    </StaticRouter>,
  );
}

describe("orgAccess", () => {
  // The person's workspace list hasn't arrived yet.
  it("list still loading → 'loading'", async () => {
    const orgAccess = await loadOrgAccess();
    expect(orgAccess(ORG_A.id, undefined, true)).toBe("loading");
  });

  // The URL's workspace is in the person's list.
  it("id in the loaded list → 'member'", async () => {
    const orgAccess = await loadOrgAccess();
    expect(orgAccess(ORG_B.id, [ORG_A, ORG_B], false)).toBe("member");
  });

  // The list is loaded and the URL's workspace isn't in it (or the list is empty).
  it("id absent from the loaded list → 'no-access'", async () => {
    const orgAccess = await loadOrgAccess();
    expect(orgAccess(FOREIGN, [ORG_A, ORG_B], false)).toBe("no-access");
    expect(orgAccess(FOREIGN, [], false)).toBe("no-access");
  });

  // A malformed (non-uuid) id is never a workspace: no-access, without waiting on the list.
  it("malformed (non-uuid) id → 'no-access', even while loading or if the list echoes it", async () => {
    const orgAccess = await loadOrgAccess();
    expect(orgAccess("abc", [ORG_A], false)).toBe("no-access");
    expect(orgAccess("abc", [{ id: "abc" }], false)).toBe("no-access");
    expect(orgAccess("abc", undefined, true)).toBe("no-access");
  });
});

describe("NoAccessView", () => {
  // Plain copy, one link per workspace the person has, and a Sign out button.
  it("says 'You don't have access to this workspace', links each own workspace, offers Sign out", async () => {
    const { NoAccessView } = (await import(
      "../src/app/access/NoAccessView"
    )) as {
      NoAccessView: ComponentType<{ orgs: Org[]; onSignOut: () => void }>;
    };
    const html = renderToStaticMarkup(
      <StaticRouter>
        <NoAccessView orgs={[ORG_A, ORG_B]} onSignOut={noop} />
      </StaticRouter>,
    );
    const shown = text(html);
    expect(shown).toContain("You don't have access to this workspace");
    for (const org of [ORG_A, ORG_B]) {
      expect(html).toContain(`href="/o/${org.id}/home"`);
      expect(shown).toContain(org.name);
    }
    expect(html.match(/<a\b[^>]*href="\/o\//g)?.length).toBe(2); // exactly one link per workspace
    expect(buttons(html)).toContain("Sign out");
  });
});

describe("OrgHomeView — landing states", () => {
  // Signed in but in no workspace yet (invite-only): say so, point at the admin, offer sign-out.
  it("zero orgs → 'You're not in a workspace yet' + ask-your-admin line + Sign out", async () => {
    const html = await renderOrgHome({ orgs: [] });
    const shown = text(html);
    expect(shown).toContain("You're not in a workspace yet");
    expect(shown).toContain("Ask your workspace admin to invite you.");
    expect(buttons(html)).toContain("Sign out");
    expect(shown).not.toContain("No orgs yet"); // the old API-hint copy is gone
    expect(shown).not.toMatch(/reach/i); // an empty account is not an outage
  });

  // API unreachable (ApiError status 0): keep naming the API base, offer Retry + Sign out.
  it("network error (ApiError status 0) → 'Can't reach the API at <base>' + Retry + Sign out", async () => {
    const error = await apiErrorFor(0);
    expect(error).toMatchObject({ status: 0 }); // a real ApiError, not today's raw TypeError
    const html = await renderOrgHome({ isError: true, error });
    const shown = text(html);
    expect(shown).toContain(`Can't reach the API at ${API_BASE}`);
    expect(shown).not.toContain("Couldn't load your workspaces.");
    expect(buttons(html)).toEqual(
      expect.arrayContaining(["Retry", "Sign out"]),
    );
  });

  // Any other failure (HTTP error, bad payload): a generic line, Retry + Sign out.
  it("other errors → 'Couldn't load your workspaces.' + Retry + Sign out", async () => {
    const serverError = await apiErrorFor(500);
    expect(serverError).toMatchObject({ status: 500 });
    for (const error of [serverError, new Error("schema mismatch")]) {
      const html = await renderOrgHome({ isError: true, error });
      const shown = text(html);
      expect(shown).toContain("Couldn't load your workspaces.");
      expect(shown).not.toContain("Can't reach the API");
      expect(buttons(html)).toEqual(
        expect.arrayContaining(["Retry", "Sign out"]),
      );
    }
  });
});
