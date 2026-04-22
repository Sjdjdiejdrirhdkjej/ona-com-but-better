import type { NextRequest } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { authFailureResponse, getRequestAuth, isAuthFailure, requireApiKeyScope } from '@/libs/ApiKeys';
import { conversationsSchema, messagesSchema } from '@/models/Schema';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getRequestAuth(req);
  if (isAuthFailure(auth)) {
    return authFailureResponse(auth);
  }
  const scopeFailure = requireApiKeyScope(auth, 'task_running');
  if (scopeFailure) {
    return authFailureResponse(scopeFailure);
  }

  const { id } = await params;

  if (auth) {
    const [conversation] = await db
      .select({ id: conversationsSchema.id })
      .from(conversationsSchema)
      .where(and(eq(conversationsSchema.id, id), eq(conversationsSchema.userId, auth.userId)))
      .limit(1);

    if (!conversation) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }
  }

  const rows = await db
    .select({
      id: messagesSchema.id,
      role: messagesSchema.role,
      content: messagesSchema.content,
    })
    .from(messagesSchema)
    .where(eq(messagesSchema.conversationId, id))
    .orderBy(asc(messagesSchema.createdAt));

  return Response.json({ messages: rows });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getRequestAuth(req);
  if (isAuthFailure(auth)) {
    return authFailureResponse(auth);
  }
  const scopeFailure = requireApiKeyScope(auth, 'task_running');
  if (scopeFailure) {
    return authFailureResponse(scopeFailure);
  }

  const { id } = await params;
  const { messageId, role, content } = await req.json() as {
    messageId: string;
    role: string;
    content: unknown;
  };

  if (auth) {
    const [conversation] = await db
      .select({ id: conversationsSchema.id })
      .from(conversationsSchema)
      .where(and(eq(conversationsSchema.id, id), eq(conversationsSchema.userId, auth.userId)))
      .limit(1);

    if (!conversation) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }
  }

  const [msg] = await db
    .insert(messagesSchema)
    .values({
      id: messageId,
      conversationId: id,
      role,
      content: typeof content === 'string' ? content : JSON.stringify(content),
    })
    .returning();

  await db
    .update(conversationsSchema)
    .set({ updatedAt: new Date() })
    .where(auth ? and(eq(conversationsSchema.id, id), eq(conversationsSchema.userId, auth.userId)) : eq(conversationsSchema.id, id));

  return Response.json(msg, { status: 201 });
}
