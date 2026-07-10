# Pattern: TanStack Query (keys factory + optimistic mutation) — dev-workflow R2/R3
```ts
// features/tasks/api.ts — the ONLY place task server-state lives
export const taskKeys = {
  all: ["tasks"] as const,
  open: (orgId: string) => [...taskKeys.all, orgId, "open"] as const,
};

export const useOpenTasksQuery = (orgId: string) =>
  useQuery({ queryKey: taskKeys.open(orgId),
             queryFn: () => api.get("/tasks?status=open", z.array(Task)) });   // apiFetch zod-parses (R6)

export const useClaimTaskMutation = () => {
  const qc = useQueryClient(); const { orgId, userId } = useOrg();
  return useMutation({
    mutationFn: (id: string) => api.post(`/tasks/${id}/claim`, {}, Task),
    onMutate: async (id) => {                                   // optimistic (R3)
      await qc.cancelQueries({ queryKey: taskKeys.open(orgId) });
      const prev = qc.getQueryData(taskKeys.open(orgId));
      qc.setQueryData(taskKeys.open(orgId), (ts: Task[] = []) =>
        ts.map(t => t.id === id ? { ...t, status: "claimed", assignee: userId } : t));
      return { prev };
    },
    onError: (_e, _id, ctx) => qc.setQueryData(taskKeys.open(orgId), ctx?.prev),  // rollback
    onSettled: () => qc.invalidateQueries({ queryKey: taskKeys.open(orgId) }),
  });
};
```
Rules: keys only from the factory · no useEffect fetching · optimistic where a human watches · invalidate on settle.
