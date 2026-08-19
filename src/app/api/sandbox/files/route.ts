import type { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { conversationsSchema } from '@/models/Schema';
import { listAllSandboxFiles } from '@/libs/Daytona';
import { authFailureResponse, getRequestAuth, isAuthFailure } from '@/libs/ApiKeys';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // Security: sandbox file listings disclose private workspace contents (file
  // names and paths of user code). Require an authenticated caller — session
  // cookie or API key — exactly like the other conversation-scoped routes.
  const auth = await getRequestAuth(req);
  if (isAuthFailure(auth)) {
    return authFailureResponse(auth);
  }
  if (!auth) {
    return Response.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const conversationId = req.nextUrl.searchParams.get('conversationId');
  if (!conversationId) {
    return Response.json({ files: [] });
  }

  // Security: ownership check (IDOR prevention) — the conversation must belong
  // to the authenticated caller. Returning an empty list (rather than 404)
  // avoids leaking whether another user's conversation ID exists.
  const [conv] = await db
    .select({ sandboxId: conversationsSchema.sandboxId })
    .from(conversationsSchema)
    .where(and(eq(conversationsSchema.id, conversationId), eq(conversationsSchema.userId, auth.userId)));

  if (!conv?.sandboxId) {
    return Response.json({ files: [] });
  }

  const files = await listAllSandboxFiles(conv.sandboxId);
  return Response.json({ files });
}
