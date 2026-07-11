// Conversation transcript screen (S7.1): reads {orgId, conversationId} from the URL (R7), fetches
// through the transcript query hook, and renders messages as inert text nodes.
import { useParams } from "wouter";
import { useTranscriptQuery } from "../features/conversations/api";
import { TranscriptView } from "../features/conversations/TranscriptView";

export function ConversationTranscript() {
  const { orgId, conversationId } = useParams<{
    orgId: string;
    conversationId: string;
  }>();
  const { data, isLoading, isError } = useTranscriptQuery(
    orgId,
    conversationId,
  );
  return (
    <section className="p-8">
      <h2 className="text-xl font-semibold">Transcript</h2>
      {isLoading ? (
        <p className="mt-2 text-sm text-gray-500">Loading transcript…</p>
      ) : isError || !data ? (
        <p className="mt-2 text-sm text-gray-500">Transcript unavailable.</p>
      ) : (
        <div className="mt-4">
          <TranscriptView messages={data.messages} />
        </div>
      )}
    </section>
  );
}
