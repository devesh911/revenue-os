// Task 50 — console data hook for GET /orgs/:orgId/agents. Mirrors features/screens/api.ts:
// R2 (server state via a TanStack Query hook keyed from the queryKeys factory) and R6 (the wire is
// Zod-parsed; the hook's data type is z.infer, never a hand-written shape). AgentsResponse is
// EXPORTED — a sanctioned deviation from screens/api.ts's module-local schemas so the hook suite
// can assert its parse contract by name.
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "../../lib/api";

export const queryKeys = {
  agents: (orgId: string) => ["agents", orgId] as const,
};

export const AgentsResponse = z.object({
  agents: z.array(
    z.object({
      id: z.string().uuid(),
      key: z.string(),
      version: z.number(),
      status: z.string(),
      model: z.string(),
      created_at: z.string(),
    }),
  ),
  workflows: z.array(
    z.object({
      id: z.string().uuid(),
      key: z.string(),
      version: z.number(),
      status: z.string(),
      created_at: z.string(),
    }),
  ),
});
export type AgentsResponse = z.infer<typeof AgentsResponse>;

export function useAgentsQuery(orgId: string) {
  return useQuery({
    queryKey: queryKeys.agents(orgId),
    queryFn: () => api(`/orgs/${orgId}/agents`, AgentsResponse),
  });
}
