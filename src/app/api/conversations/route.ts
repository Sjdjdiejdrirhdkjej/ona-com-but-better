import type { NextRequest } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { conversationsSchema, messagesSchema } from '@/models/Schema';

export async function GET() {
  const conversations = await db
    .select()
    .from(conversationsSchema)
    .orderBy(desc(conversationsSchema.updatedAt));

  const result = await Promise.all(
    conversations.map(async (conv) => {
      const messages = await db
        .select()
        .from(messagesSchema)
        .where(eq(messagesSchema.conversationId, conv.id))
        .orderBy(messagesSchema.createdAt);

      return {
        ...conv,
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

  return Response.json(result);
}

export async function POST(req: NextRequest) {
  const { id, title } = await req.json() as { id: string; title: string };

  const [conv] = await db
    .insert(conversationsSchema)
    .values({ id, title })
    .returning();

  return Response.json(conv, { status: 201 });
}
