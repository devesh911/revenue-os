// Home — the flagship page (Bland-style hero adapted to revenue-os): centered welcome,
// a large pill ask/command bar with a circular send button, suggestion chips that
// deep-link into the app, and real recent-conversation continue cards (data via the
// existing conversations query hook — R2; loading/error/empty handled where data lands).
// The ask bar is the assistant's future front door: submitting shows an honest
// "not wired yet" notice instead of faking a response.
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useConversationsQuery } from "../../features/screens/api";
import { ConversationLink } from "../../screens/ConversationLink";
import { type IconName, icons, SendIcon } from "../../ui/icons";
import { Section } from "../../ui/layout";
import {
  Avatar,
  Badge,
  Card,
  Chip,
  DataShell,
  IconButton,
} from "../../ui/primitives";

const SUGGESTIONS: Array<{ label: string; icon: IconName; to: string }> = [
  { label: "Review open tasks", icon: "tasks", to: "tasks" },
  { label: "Watch live conversations", icon: "conversations", to: "live" },
  { label: "Browse contacts", icon: "contacts", to: "contacts" },
  { label: "Check performance", icon: "analytics", to: "dashboard" },
];

const ACTIVE_STATUSES = new Set(["queued", "ringing", "active"]);

function startedLabel(startedAt: string | null): string {
  if (!startedAt) return "—";
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function AskBar() {
  const [ask, setAsk] = useState("");
  const [notice, setNotice] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setNotice(true);
      }}
    >
      <div className="flex items-center gap-3 rounded-pill border border-line bg-surface py-2 pr-2 pl-6 shadow-pop focus-within:border-ink/30">
        <input
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="Ask about your pipeline, contacts, or conversations…"
          aria-label="Ask the assistant"
          className="h-11 w-full bg-transparent text-body text-ink outline-none placeholder:text-muted"
        />
        <IconButton type="submit" aria-label="Send" variant="primary" size="lg">
          <SendIcon size={19} />
        </IconButton>
      </div>
      {notice ? (
        <p className="mt-3 text-center text-[13px] text-muted">
          The assistant isn't wired up yet — it arrives in a later phase. Try a
          shortcut below.
        </p>
      ) : null}
    </form>
  );
}

function RecentConversations({ orgId }: { orgId: string }) {
  const { data, isLoading, isError } = useConversationsQuery(orgId);
  const recent = data?.conversations.slice(0, 3) ?? [];
  return (
    <DataShell
      isLoading={isLoading}
      isError={isError || !data}
      isEmpty={recent.length === 0}
      errorText="Unable to load recent conversations."
      emptyText="No conversations yet — they'll appear here as your agents start talking."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {recent.map((convo) => {
          const name = convo.contact_name ?? "Unknown";
          return (
            <Card key={convo.id} className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <Avatar name={name} size="sm" />
                <span className="min-w-0 truncate text-sm font-semibold text-ink">
                  <ConversationLink orgId={orgId} conversationId={convo.id}>
                    {name}
                  </ConversationLink>
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <Badge
                  tone={
                    ACTIVE_STATUSES.has(convo.status) ? "accent" : "neutral"
                  }
                >
                  {convo.status}
                </Badge>
                <span>
                  {convo.channel} · {startedLabel(convo.started_at)}
                </span>
              </div>
            </Card>
          );
        })}
      </div>
    </DataShell>
  );
}

export function HomePage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [, navigate] = useLocation();
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="pt-16 pb-10 text-center">
        <h1 className="text-hero">Welcome back</h1>
        <p className="mt-4 text-body text-muted">
          Ask for anything, or jump back into the pipeline.
        </p>
      </div>
      <AskBar />
      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        {SUGGESTIONS.map((s) => {
          const Icon = icons[s.icon];
          return (
            <Chip
              key={s.to}
              icon={<Icon size={15} />}
              onClick={() => navigate(`/o/${orgId}/${s.to}`)}
            >
              {s.label}
            </Chip>
          );
        })}
      </div>
      <Section label="Recent conversations" className="mt-16">
        <RecentConversations orgId={orgId} />
      </Section>
    </div>
  );
}
