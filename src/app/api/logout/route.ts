import * as client from 'openid-client';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import type { AppSession } from '@/libs/session';
import { sessionOptions } from '@/libs/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const session = await getIronSession<AppSession>(cookieStore, sessionOptions);
  session.destroy();

  const config = await client.discovery(
    new URL('https://replit.com/oidc'),
    process.env.REPL_ID!,
  );

  const host = req.headers.get('host') ?? '';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const postLogoutUrl = `${protocol}://${host}`;

  const endSessionUrl = client.buildEndSessionUrl(config, {
    client_id: process.env.REPL_ID!,
    post_logout_redirect_uri: postLogoutUrl,
  });

  return NextResponse.redirect(endSessionUrl.href);
}
