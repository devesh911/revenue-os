// R2: ALL server state through TanStack Query hooks in features/*/api.ts, keys from the
// queryKeys factory. Shapes come from packages/shared — never re-declared (R6).
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "../../lib/api";

export const queryKeys = {
  orgs: ["orgs"] as const,
};

const OrgsResponse = z.array(
  z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    role: z.enum(["admin", "operator", "viewer"]),
  }),
);
export type OrgListItem = z.infer<typeof OrgsResponse>[number];

export function useOrgsQuery() {
  return useQuery({
    queryKey: queryKeys.orgs,
    queryFn: () => api("/orgs", OrgsResponse),
  });
}
