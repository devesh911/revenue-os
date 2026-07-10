// Drizzle mirror of supabase/migrations DDL (db-design is the source of truth — this file
// only reflects it; DDL changes NEVER start here). Mirrored on demand: tables appear here
// when the first query helper needs them.
// G1: runtime-agnostic.
import {
  boolean,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  vertical: text("vertical").notNull().default("generic"),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  companyId: uuid("company_id"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  preferredLanguage: text("preferred_language").notNull().default("en"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  lifecycleStage: text("lifecycle_stage").notNull().default("new"),
  source: text("source"),
  ownerUserId: uuid("owner_user_id"),
  consent: jsonb("consent").notNull(),
  attributes: jsonb("attributes").notNull().default({}),
  score: numeric("score", { precision: 6, scale: 2 }),
  scoreUpdatedAt: timestamp("score_updated_at", { withTimezone: true }),
  lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
  mergedIntoId: uuid("merged_into_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const contactIdentities = pgTable("contact_identities", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  contactId: uuid("contact_id").notNull(),
  kind: text("kind").notNull(),
  value: text("value").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
