import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
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
  scope: text('scope').notNull().default('task_running'),
  requestCount: integer('request_count').notNull().default(0),
  rateLimitPerHour: integer('rate_limit_per_hour').notNull().default(60),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at', { mode: 'date' }),
  revokedAt: timestamp('revoked_at', { mode: 'date' }),
});

export const apiKeyRateLimitsSchema = pgTable('api_key_rate_limits', {
  apiKeyId: text('api_key_id')
    .primaryKey()
    .references(() => apiKeysSchema.id, { onDelete: 'cascade' }),
  windowStart: timestamp('window_start', { mode: 'date' }).notNull(),
  requestCount: integer('request_count').notNull().default(0),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
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

export const codebaseMemorySchema = pgTable('codebase_memory', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: text('user_id').notNull(),
  key: text('key').notNull(),
  content: text('content').notNull(),
  category: text('category').notNull().default('general'),
  confidence: integer('confidence').notNull().default(1),
  sourceConversationId: text('source_conversation_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, (table) => [
  uniqueIndex('codebase_memory_user_key_idx').on(table.userId, table.key),
]);

export const demoRequestsSchema = pgTable('demo_requests', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull(),
  company: text('company').notNull(),
  size: text('size').notNull().default(''),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const conversationSuperAgentsSchema = pgTable('conversation_super_agents', {
  conversationId: text('conversation_id')
    .primaryKey()
    .references(() => conversationsSchema.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  heartbeatMinutes: integer('heartbeat_minutes').notNull().default(15),
  wakePrompt: text('wake_prompt').notNull(),
  model: text('model').notNull().default('ona-hands-off'),
  nextHeartbeatAt: timestamp('next_heartbeat_at', { mode: 'date' }),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { mode: 'date' }),
  lastRunStatus: text('last_run_status').notNull().default('idle'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
