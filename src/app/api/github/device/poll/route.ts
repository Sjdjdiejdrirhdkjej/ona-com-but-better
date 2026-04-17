import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';

import { db } from '@/libs/DB';
import { userGithubTokensSchema } from '@/models/Schema';
import type { AppSession } from '@/libs/session';
import { sessionOptions } from '@/libs/session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return Response.json({ error: 'GitHub not configured' }, { status: 500 });
  }

  const { device_code } = await req.json() as { device_code: string };

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });

  const data = await res.json() as {
    access_token?: string;
    error?: string;
    token_type?: string;
    scope?: string;
  };

  if (data.access_token) {
    const cookieStore = await cookies();
    const session = await getIronSession<AppSession>(cookieStore, sessionOptions);
    session.githubToken = data.access_token;
    await session.save();

    if (session.user?.id) {
      await db
        .insert(userGithubTokensSchema)
        .values({ userId: session.user.id, githubToken: data.access_token })
        .onConflictDoUpdate({
          target: userGithubTokensSchema.userId,
          set: { githubToken: data.access_token, updatedAt: new Date() },
        });
    }

    return Response.json({ status: 'authorized' });
  }

  if (data.error === 'authorization_pending' || data.error === 'slow_down') {
    return Response.json({ status: data.error });
  }

  return Response.json({ status: 'error', error: data.error });
}
