// Boundary truth (T11): every boundary parses with these — never re-declare shapes locally.
import { z } from "zod";

export const OrgIdSchema = z.string().uuid();

export const OrgRoleSchema = z.enum(["admin", "operator", "viewer"]);
export type OrgRole = z.infer<typeof OrgRoleSchema>;

export const CreateOrgSchema = z
  .object({
    name: z.string().min(1).max(120),
    slug: z
      .string()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9][a-z0-9-]*$/),
    vertical: z.string().min(1).max(40).default("generic"),
  })
  .strict();
export type CreateOrg = z.infer<typeof CreateOrgSchema>;

export const AddMemberSchema = z
  .object({
    userId: z.string().uuid(),
    role: OrgRoleSchema,
  })
  .strict();
export type AddMember = z.infer<typeof AddMemberSchema>;
