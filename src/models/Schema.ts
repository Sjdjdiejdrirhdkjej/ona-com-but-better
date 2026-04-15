import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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
