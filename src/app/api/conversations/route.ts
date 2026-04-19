import type { NextRequest } from 'next/server';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { agentJobsSchema, conversationsSchema, messagesSchema } from '@/models/Schema';

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');

  const whereClause = sessionId
    ? eq(conversationsSchema.sessionId, sessionId)
    : or(isNull(conversationsSchema.sessionId), eq(conversationsSchema.sessionId, ''));

  const conversations = await db
    .select()
    .from(conversationsSchema)
    .where(whereClause)
    .orderBy(desc(conversationsSchema.updatedAt));

  return Response.json(await hydrateConversations(conversations));
}

async function hydrateConversations(conversations: (typeof conversationsSchema.$inferSelect)[]) {
  return Promise.all(
    conversations.map(async (conv) => {
      const messages = await db
        .select()
        .from(messagesSchema)
        .where(eq(messagesSchema.conversationId, conv.id))
        .orderBy(messagesSchema.createdAt);

      const runningJobs = await db
        .select()
        .from(agentJobsSchema)
        .where(and(eq(agentJobsSchema.conversationId, conv.id), eq(agentJobsSchema.status, 'running')));

      const activeJob = runningJobs[0] ?? null;

      return {
        ...conv,
        activeJobId: activeJob?.id ?? null,
        messages: messages.map(m => ({
          ...m,
          content: (() => {
            try {
              return JSON.parse(m.content);
            } catch {
              return m.content;
            }
          })(),
        })),
      };
    }),
  );
}

export async function POST(req: NextRequest) {
  const { id, title, sessionId } = await req.json() as { id: string; title: string; sessionId?: string };

  const [conv] = await db
    .insert(conversationsSchema)
    .values({
      id,
      title,
      sessionId: sessionId ?? null,
      userId: null,
    })
    .onConflictDoNothing()
    .returning();

  return Response.json(conv ?? { id, title }, { status: conv ? 201 : 200 });
}
