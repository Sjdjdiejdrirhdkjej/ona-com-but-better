import type { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { conversationsSchema, messagesSchema } from '@/models/Schema';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { messageId, role, content } = await req.json() as {
    messageId: string;
    role: string;
    content: unknown;
  };

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
    .where(eq(conversationsSchema.id, id));

  return Response.json(msg, { status: 201 });
}
