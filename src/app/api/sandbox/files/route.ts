import type { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { conversationsSchema } from '@/models/Schema';
import { listAllSandboxFiles } from '@/libs/Daytona';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get('conversationId');
  if (!conversationId) {
    return Response.json({ files: [] });
  }

  const [conv] = await db
    .select({ sandboxId: conversationsSchema.sandboxId })
    .from(conversationsSchema)
    .where(eq(conversationsSchema.id, conversationId));

  if (!conv?.sandboxId) {
    return Response.json({ files: [] });
  }

  const files = await listAllSandboxFiles(conv.sandboxId);
  return Response.json({ files });
}
