// Conversation transcript page (S7.1) — migrated from src/screens/transcript.tsx (that
// path was NOT test-pinned, unlike its screens/ siblings). Reads {orgId, conversationId}
// from the URL (R7), fetches through the transcript query hook, and renders messages as
// inert text nodes via the test-pinned TranscriptView (features/conversations/).
import { useParams } from "wouter";
import { useTranscriptQuery } from "../../features/conversations/api";
import { TranscriptView } from "../../features/conversations/TranscriptView";
import { PageHeader } from "../../ui/layout";
import { Card, DataShell } from "../../ui/primitives";

export function TranscriptPage() {
  const { orgId, conversationId } = useParams<{
    orgId: string;
    conversationId: string;
  }>();
  const { data, isLoading, isError } = useTranscriptQuery(
    orgId,
    conversationId,
  );
  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Transcript"
        description="Every message in this conversation, verbatim."
      />
      <DataShell
        isLoading={isLoading}
        isError={isError || !data}
        loadingText="Loading transcript…"
        errorText="Transcript unavailable."
      >
        <Card padding="lg">
          <TranscriptView messages={data?.messages ?? []} />
        </Card>
      </DataShell>
    </div>
  );
}
