import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { getSession } from '@/libs/ReplitAuth';
import { userGithubTokensSchema } from '@/models/Schema';

export const dynamic = 'force-dynamic';

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete('github_token');

  const session = await getSession();
  if (session.user?.id) {
    await db.delete(userGithubTokensSchema).where(eq(userGithubTokensSchema.userId, session.user.id));
  }

  return Response.json({ ok: true });
}
