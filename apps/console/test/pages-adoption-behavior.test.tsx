// task-31 (wave 5 B) · B2-RED — BEHAVIOR pins: after adopting DataShell + the Table suite each page
// must still render the SAME per-state copy and the SAME key content. renderToStaticMarkup over the
// REAL page with its query hook MOCKED (bun mock.module) and orgId/conversationId supplied by a
// static SSR <Router>/<Route> — the ui-smoke + console-boot-honesty precedent, env-free by
// construction (mocking the api module also keeps lib/api's import.meta.env off the module graph).
// Conversations & Contacts read features/screens/api; Transcript reads features/conversations/api.
//
// Most cases are regression pins (copy/content is unchanged by the refactor); the ONE RED-today case
// is the KNOWN intended visual delta — Contacts' header cells gain the standardized TH token
// `font-medium` when they adopt the TH primitive (today Contacts' header string omits it).
import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router } from "wouter";
import * as realConversationsApi from "../src/features/conversations/api";
import * as realScreensApi from "../src/features/screens/api";
import { visible } from "./test-utils";

const ORG = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";

type Query<T> = { data: T | undefined; isLoading: boolean; isError: boolean };

type ConversationsData = {
  conversations: Array<{
    id: string;
    channel: string;
    status: string;
    direction: string;
    contact_name: string | null;
    started_at: string | null;
    ended_at: string | null;
  }>;
};
type ContactsData = {
  contacts: Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    lifecycle_stage: string;
    score: number | null;
    last_interaction_at: string | null;
    created_at: string;
    latest_conversation_id: string | null;
  }>;
};
type TranscriptData = {
  messages: Array<{
    seq: number;
    role: "agent" | "contact" | "human_agent" | "system" | "tool";
    content: string | null;
    ts: string | null;
  }>;
};

// The mocked hooks read these mutable holders, so a test sets state then renders the same page.
let convState: Query<ConversationsData>;
let contactsState: Query<ContactsData>;
let transcriptState: Query<TranscriptData>;

let ConversationsPage: () => ReactElement;
let ContactsPage: () => ReactElement;
let TranscriptPage: () => ReactElement;

beforeAll(async () => {
  // mock.module is process-global and REPLACES the whole module for every LATER importer in the
  // process — so spread the real module first and override only the hooks this file stubs. Else a
  // sibling test file that imports an export we'd otherwise drop (e.g. useMetricsQuery, read by the
  // Dashboard page) fails to link with "Export named '…' not found" once the suites run merged (#71).
  mock.module("../src/features/screens/api", () => ({
    ...realScreensApi,
    useConversationsQuery: () => convState,
    useContactsQuery: () => contactsState,
  }));
  mock.module("../src/features/conversations/api", () => ({
    ...realConversationsApi,
    useTranscriptQuery: () => transcriptState,
  }));
  ConversationsPage = (await import("../src/pages/Conversations"))
    .ConversationsPage;
  ContactsPage = (await import("../src/pages/Contacts")).ContactsPage;
  TranscriptPage = (await import("../src/pages/Transcript")).TranscriptPage;
});

afterAll(() => {
  mock.restore(); // mock.module is process-global — restore so no other file sees the fakes
});

// Render a page element under a static SSR router so wouter's useParams() yields the URL params and
// its <Link> anchors resolve — no QueryClient/DB/network, exactly like the ui-smoke AppShell case.
const atRoute = (path: string, ssrPath: string, el: ReactElement): string =>
  renderToStaticMarkup(
    <Router ssrPath={ssrPath}>
      <Route path={path}>{el}</Route>
    </Router>,
  );

const renderConversations = (): string =>
  atRoute("/o/:orgId/live", `/o/${ORG}/live`, <ConversationsPage />);
const renderContacts = (): string =>
  atRoute("/o/:orgId/contacts", `/o/${ORG}/contacts`, <ContactsPage />);
const renderTranscript = (): string =>
  atRoute(
    "/o/:orgId/conversations/:conversationId",
    `/o/${ORG}/conversations/${CONV}`,
    <TranscriptPage />,
  );

describe("task-31 behavior: Conversations page states + content", () => {
  it("loading → 'Loading…', the table (its 'Channel' header) hidden", () => {
    convState = { data: undefined, isLoading: true, isError: false };
    const text = visible(renderConversations());
    expect(text).toContain("Loading…");
    expect(text).not.toContain("Channel");
  });

  it("error → 'Unable to load data.'", () => {
    convState = { data: undefined, isLoading: false, isError: true };
    expect(visible(renderConversations())).toContain("Unable to load data.");
  });

  it("no data (undefined, isError false) still shows the error state, never a crash", () => {
    convState = { data: undefined, isLoading: false, isError: false };
    expect(visible(renderConversations())).toContain("Unable to load data.");
  });

  it("empty → 'No conversations.', no rows", () => {
    convState = {
      data: { conversations: [] },
      isLoading: false,
      isError: false,
    };
    const text = visible(renderConversations());
    expect(text).toContain("No conversations.");
    expect(text).not.toContain("Channel");
  });

  it("happy → the four headers + a row's real fields (deep-linked name preserved)", () => {
    convState = {
      data: {
        conversations: [
          {
            id: CONV,
            channel: "sms",
            status: "active",
            direction: "outbound",
            contact_name: "Ada Lovelace",
            started_at: "2026-07-01T00:00:00Z",
            ended_at: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    };
    const text = visible(renderConversations());
    for (const header of ["Contact", "Channel", "Status", "Started"]) {
      expect(text).toContain(header);
    }
    expect(text).toContain("Ada Lovelace");
    expect(text).toContain("sms");
    expect(text).toContain("active");
    expect(text).toContain("2026-07-01T00:00:00Z");
  });
});

// A fully-populated contact so the happy-path + header-token assertions have a real row to render.
const CONTACT_ROW = {
  id: "33333333-3333-4333-8333-333333333333",
  first_name: "Ada",
  last_name: "Lovelace",
  lifecycle_stage: "lead",
  score: 42,
  last_interaction_at: "2026-07-02T00:00:00Z",
  created_at: "2026-07-01T00:00:00Z",
  latest_conversation_id: CONV,
};

describe("task-31 behavior: Contacts page states + content", () => {
  it("loading → 'Loading…', the table (its 'Lifecycle stage' header) hidden", () => {
    contactsState = { data: undefined, isLoading: true, isError: false };
    const text = visible(renderContacts());
    expect(text).toContain("Loading…");
    expect(text).not.toContain("Lifecycle stage");
  });

  it("error → 'Unable to load data.'", () => {
    contactsState = { data: undefined, isLoading: false, isError: true };
    expect(visible(renderContacts())).toContain("Unable to load data.");
  });

  it("no data (undefined, isError false) still shows the error state, never a crash", () => {
    contactsState = { data: undefined, isLoading: false, isError: false };
    expect(visible(renderContacts())).toContain("Unable to load data.");
  });

  it("empty → 'No contacts.'", () => {
    contactsState = {
      data: { contacts: [] },
      isLoading: false,
      isError: false,
    };
    expect(visible(renderContacts())).toContain("No contacts.");
  });

  it("happy → the four headers + a row's real fields", () => {
    contactsState = {
      data: { contacts: [CONTACT_ROW] },
      isLoading: false,
      isError: false,
    };
    const text = visible(renderContacts());
    for (const header of [
      "Name",
      "Lifecycle stage",
      "Score",
      "Last interaction",
    ]) {
      expect(text).toContain(header);
    }
    expect(text).toContain("Ada Lovelace");
    expect(text).toContain("lead");
    expect(text).toContain("42");
    expect(text).toContain("2026-07-02T00:00:00Z");
  });

  // THE KNOWN INTENDED VISUAL DELTA (RED today): Contacts' hand-rolled header string omits
  // font-medium; the TH primitive standardizes the header weight, so the <thead> must carry the
  // full standardized TH token set — font-medium included — once Contacts adopts TH.
  it("header cells carry the standardized TH token classes, incl. font-medium (the intended delta)", () => {
    contactsState = {
      data: { contacts: [CONTACT_ROW] },
      isLoading: false,
      isError: false,
    };
    const thead = renderContacts().match(/<thead[\s\S]*?<\/thead>/)?.[0] ?? "";
    for (const cls of [
      "py-2.5",
      "pr-4",
      "text-label",
      "text-muted",
      "uppercase",
      "font-medium",
    ]) {
      expect(thead).toContain(cls);
    }
  });
});

describe("task-31 behavior: Transcript page keeps its exact custom copy + renders messages", () => {
  it("loading → exact 'Loading transcript…' (its copy, not DataShell's default)", () => {
    transcriptState = { data: undefined, isLoading: true, isError: false };
    expect(visible(renderTranscript())).toContain("Loading transcript…");
  });

  it("error → exact 'Transcript unavailable.' (never the default 'Unable to load data.')", () => {
    transcriptState = { data: undefined, isLoading: false, isError: true };
    const text = visible(renderTranscript());
    expect(text).toContain("Transcript unavailable.");
    expect(text).not.toContain("Unable to load data.");
  });

  it("no data (undefined, isError false) shows 'Transcript unavailable.'", () => {
    transcriptState = { data: undefined, isLoading: false, isError: false };
    expect(visible(renderTranscript())).toContain("Transcript unavailable.");
  });

  it("happy → renders the transcript message (role + verbatim content) + header description", () => {
    transcriptState = {
      data: {
        messages: [
          {
            seq: 1,
            role: "agent",
            content: "Hello there",
            ts: "2026-07-01T00:00:00Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
    };
    const text = visible(renderTranscript());
    expect(text).toContain("agent");
    expect(text).toContain("Hello there");
    expect(text).toContain("Every message in this conversation, verbatim.");
  });
});
