import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { getSession } from '@/libs/ReplitAuth';
import { apiKeysSchema } from '@/models/Schema';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  await db
    .update(apiKeysSchema)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeysSchema.id, id), eq(apiKeysSchema.userId, session.user.id)));

  return new Response(null, { status: 204 });
}