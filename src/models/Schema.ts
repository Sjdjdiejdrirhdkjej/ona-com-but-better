import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const userCreditsSchema = pgTable('user_credits', {
  userId: text('user_id').primaryKey(),
  credits: integer('credits').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const userGithubTokensSchema = pgTable('user_github_tokens', {
  userId: text('user_id').primaryKey(),
  githubToken: text('github_token').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const apiKeysSchema = pgTable('api_keys', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  keyPrefix: text('key_prefix').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at', { mode: 'date' }),
  revokedAt: timestamp('revoked_at', { mode: 'date' }),
});

export const counterSchema = pgTable('counter', {
  id: serial('id').primaryKey(),
  count: integer('count').default(0),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const conversationsSchema = pgTable('conversations', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  title: text('title').notNull().default('New task'),
  sandboxId: text('sandbox_id'),
  sessionId: text('session_id'),
  userId: text('user_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const messagesSchema = pgTable('messages', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversationsSchema.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const agentJobsSchema = pgTable('agent_jobs', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversationsSchema.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('running'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const agentEventsSchema = pgTable('agent_events', {
  id: serial('id').primaryKey(),
  jobId: text('job_id')
    .notNull()
    .references(() => agentJobsSchema.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  data: text('data').notNull().default('{}'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
