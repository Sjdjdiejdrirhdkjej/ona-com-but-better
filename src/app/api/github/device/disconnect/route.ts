import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';

import { db } from '@/libs/DB';
import { userGithubTokensSchema } from '@/models/Schema';
import type { AppSession } from '@/libs/session';
import { sessionOptions } from '@/libs/session';

export const dynamic = 'force-dynamic';

export async function POST() {
  const cookieStore = await cookies();
  const session = await getIronSession<AppSession>(cookieStore, sessionOptions);

  if (session.user?.id) {
    await db
      .delete(userGithubTokensSchema)
      .where(eq(userGithubTokensSchema.userId, session.user.id));
  }

  session.githubToken = undefined;
  await session.save();
  return Response.json({ ok: true });
}
