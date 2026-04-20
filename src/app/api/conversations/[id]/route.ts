import type { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { conversationsSchema } from '@/models/Schema';
import { deleteSandboxById } from '@/libs/Daytona';
import { getBearerToken, getRequestAuth } from '@/libs/ApiKeys';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getRequestAuth(req);
  if (getBearerToken(req) && !auth) {
    return Response.json({ error: 'Invalid API key' }, { status: 401 });
  }

  const { id } = await params;
  const { title } = await req.json() as { title: string };

  await db
    .update(conversationsSchema)
    .set({ title, updatedAt: new Date() })
    .where(auth ? and(eq(conversationsSchema.id, id), eq(conversationsSchema.userId, auth.userId)) : eq(conversationsSchema.id, id));

  return new Response(null, { status: 204 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getRequestAuth(req);
  if (getBearerToken(req) && !auth) {
    return Response.json({ error: 'Invalid API key' }, { status: 401 });
  }

  const { id } = await params;

  const [conv] = await db
    .select({ sandboxId: conversationsSchema.sandboxId })
    .from(conversationsSchema)
    .where(auth ? and(eq(conversationsSchema.id, id), eq(conversationsSchema.userId, auth.userId)) : eq(conversationsSchema.id, id));

  if (conv?.sandboxId) {
    await deleteSandboxById(conv.sandboxId);
  }

  await db.delete(conversationsSchema).where(auth ? and(eq(conversationsSchema.id, id), eq(conversationsSchema.userId, auth.userId)) : eq(conversationsSchema.id, id));

  return new Response(null, { status: 204 });
}
