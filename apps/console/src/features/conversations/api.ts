// R2: ALL server state through TanStack Query hooks in features/*/api.ts, keys from the
// queryKeys factory. The response is Zod-parsed here; the hook's data type is z.infer — never
// a hand-written shape (R6). Mirrors features/orgs/api.ts.
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "../../lib/api";

export const queryKeys = {
  transcript: (orgId: string, conversationId: string) =>
    ["transcript", orgId, conversationId] as const,
};

const TranscriptResponse = z.object({
  messages: z.array(
    z.object({
      seq: z.number(),
      role: z.enum(["agent", "contact", "human_agent", "system", "tool"]),
      content: z.string().nullable(),
      ts: z.string().nullable(),
    }),
  ),
});
export type TranscriptResponse = z.infer<typeof TranscriptResponse>;

export function useTranscriptQuery(orgId: string, conversationId: string) {
  return useQuery({
    queryKey: queryKeys.transcript(orgId, conversationId),
    queryFn: () =>
      api(
        `/orgs/${orgId}/conversations/${conversationId}/messages`,
        TranscriptResponse,
      ),
  });
}
