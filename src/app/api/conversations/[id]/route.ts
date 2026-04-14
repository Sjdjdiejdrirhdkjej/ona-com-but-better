import type { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { conversationsSchema } from '@/models/Schema';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { title } = await req.json() as { title: string };

  await db
    .update(conversationsSchema)
    .set({ title, updatedAt: new Date() })
    .where(eq(conversationsSchema.id, id));

  return new Response(null, { status: 204 });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  await db.delete(conversationsSchema).where(eq(conversationsSchema.id, id));

  return new Response(null, { status: 204 });
}
