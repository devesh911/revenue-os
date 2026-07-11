// Boundary truth (T11): every boundary parses with these — never re-declare shapes locally.
import { z } from "zod";

export const OrgIdSchema = z.string().uuid();
export const ConversationIdSchema = z.string().uuid();

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

export const UpdateOrgSchema = z
  .object({
    name: z.string().min(1).max(120),
  })
  .strict();
export type UpdateOrg = z.infer<typeof UpdateOrgSchema>;

// Vapi webhook envelope — only the fields we consume; everything else passes through
// untouched (S6.5: payloads stay untrusted even after the signature check).
export const VapiWebhookSchema = z
  .object({
    message: z
      .object({
        type: z.string(),
        id: z.string().optional(),
        timestamp: z.string().optional(),
        call: z.object({ id: z.string() }).passthrough().optional(),
        role: z.enum(["assistant", "user"]).optional(),
        transcript: z.string().optional(),
        summary: z.string().optional(),
        endedReason: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();
export type VapiWebhook = z.infer<typeof VapiWebhookSchema>;
