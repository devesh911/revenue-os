// The app_service client (withOrg sets request.org_id per transaction) and the queries built on it: the one way
// into the database.
// G1: runtime-agnostic — no bun:* imports, no Bun globals in this package.

export {
  type AgentRow,
  listAgentsAndWorkflows,
  type WorkflowRow,
} from "./agents";
export { type ActorType, type AuditEntry, audit } from "./audit";
export { createPool, type PoolClient, withOrg } from "./client";
export { type ImportSummary, importContacts } from "./contacts";
export { conversationMessages, type TranscriptRow } from "./conversations";
export {
  type GuardrailPolicyRow,
  listGuardrailPolicies,
  upsertGuardrailPolicy,
} from "./guardrails";
export {
  addMember,
  createOrgWithAdmin,
  memberRole,
  type OrgRow,
  updateOrg,
  userOrgs,
} from "./orgs";
export {
  type ContactRow,
  type ConversationRow,
  type FunnelMetrics,
  funnelMetrics,
  funnelTrends,
  listContacts,
  listConversations,
  listTasks,
  type TaskRow,
  type TrendRow,
} from "./screens";
