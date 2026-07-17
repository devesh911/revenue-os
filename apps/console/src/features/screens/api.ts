// R2: ALL server state through TanStack Query hooks in features/*/api.ts, keys from the
// queryKeys factory. The response is Zod-parsed here; the hook's data type is z.infer — never
// a hand-written shape (R6). Mirrors features/conversations/api.ts.
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "../../lib/api";

export const queryKeys = {
  tasks: (orgId: string) => ["tasks", orgId] as const,
  contacts: (orgId: string) => ["contacts", orgId] as const,
  conversations: (orgId: string) => ["conversations", orgId] as const,
  metrics: (orgId: string) => ["metrics", orgId] as const,
};

const TasksResponse = z.object({
  tasks: z.array(
    z.object({
      id: z.string().uuid(),
      kind: z.string(),
      status: z.string(),
      priority: z.number().nullable(),
      title: z.string(),
      contact_id: z.string().uuid().nullable(),
      conversation_id: z.string().uuid().nullable(),
      due_at: z.string().nullable(),
      created_at: z.string(),
    }),
  ),
});
export type TasksResponse = z.infer<typeof TasksResponse>;

export function useTasksQuery(orgId: string) {
  return useQuery({
    queryKey: queryKeys.tasks(orgId),
    queryFn: () => api(`/orgs/${orgId}/tasks`, TasksResponse),
  });
}

const ContactsResponse = z.object({
  contacts: z.array(
    z.object({
      id: z.string().uuid(),
      first_name: z.string().nullable(),
      last_name: z.string().nullable(),
      lifecycle_stage: z.string(),
      score: z.number().nullable(),
      last_interaction_at: z.string().nullable(),
      created_at: z.string(),
      // task 17: id of the contact's newest conversation (by started_at), for the transcript
      // deep-link; null when the contact has no conversations yet.
      latest_conversation_id: z.string().uuid().nullable(),
    }),
  ),
});
export type ContactsResponse = z.infer<typeof ContactsResponse>;

export function useContactsQuery(orgId: string) {
  return useQuery({
    queryKey: queryKeys.contacts(orgId),
    queryFn: () => api(`/orgs/${orgId}/contacts`, ContactsResponse),
  });
}

const ConversationsResponse = z.object({
  conversations: z.array(
    z.object({
      id: z.string().uuid(),
      channel: z.string(),
      status: z.string(),
      direction: z.string(),
      contact_name: z.string().nullable(),
      started_at: z.string().nullable(),
      ended_at: z.string().nullable(),
    }),
  ),
});
export type ConversationsResponse = z.infer<typeof ConversationsResponse>;

export function useConversationsQuery(orgId: string) {
  return useQuery({
    queryKey: queryKeys.conversations(orgId),
    queryFn: () => api(`/orgs/${orgId}/conversations`, ConversationsResponse),
  });
}

const MetricsResponse = z.object({
  metrics: z.object({
    new_leads: z.number(),
    conversations_started: z.number(),
    conversations_completed: z.number(),
    qualified: z.number(),
    bookings: z.number(),
    open_tasks: z.number(),
  }),
});
export type MetricsResponse = z.infer<typeof MetricsResponse>;

export function useMetricsQuery(orgId: string) {
  return useQuery({
    queryKey: queryKeys.metrics(orgId),
    queryFn: () => api(`/orgs/${orgId}/metrics`, MetricsResponse),
  });
}
