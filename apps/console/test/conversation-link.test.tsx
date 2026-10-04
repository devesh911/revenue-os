// The shared conversation link (src/features/conversations/ConversationLink.tsx), which the Home, Tasks, Contacts
// and Conversations pages link through: a conversation id links its children to that conversation's transcript,
// in the accent colour; no id renders them as plain text. Rendered inside a static router, with no data or network.
// That a click on a contact's link really opens the transcript is a browser test (e2e/screens.e2e.ts).
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationLink } from "../src/features/conversations/ConversationLink";
import { StaticRouter } from "./router";

const ORG = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";

describe("ConversationLink", () => {
  // behaviour already on main: moved from tests/conversation-link.test.tsx unchanged in what it checks
  it("links its children to /o/<org>/conversations/<id>, in the accent colour", () => {
    const html = renderToStaticMarkup(
      <StaticRouter>
        <ConversationLink orgId={ORG} conversationId={CONV}>
          Ada Lovelace
        </ConversationLink>
      </StaticRouter>,
    );
    expect(html).toContain(
      `<a href="/o/${ORG}/conversations/${CONV}" class="text-accent hover:underline">Ada Lovelace</a>`,
    );
  });

  // behaviour already on main: moved from tests/conversation-link.test.tsx unchanged in what it checks
  it("renders its children as plain text, with no link, when there is no conversation", () => {
    const html = renderToStaticMarkup(
      <StaticRouter>
        <ConversationLink orgId={ORG} conversationId={null}>
          Grace Hopper
        </ConversationLink>
      </StaticRouter>,
    );
    expect(html).toContain("Grace Hopper");
    expect(html).not.toMatch(/<a[\s>]/);
  });
});
