import * as client from 'openid-client';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import type { AppSession } from '@/libs/session';
import { sessionOptions } from '@/libs/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cookieStore = await cookies();

  const codeVerifier = cookieStore.get('oidc_code_verifier')?.value;
  const expectedState = cookieStore.get('oidc_state')?.value;

  if (!codeVerifier || !expectedState) {
    return NextResponse.redirect(new URL('/api/login', req.url));
  }

  cookieStore.delete('oidc_code_verifier');
  cookieStore.delete('oidc_state');

  const config = await client.discovery(
    new URL('https://replit.com/oidc'),
    process.env.REPL_ID!,
  );

  const host = req.headers.get('host') ?? '';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const callbackUrl = `${protocol}://${host}/api/callback`;

  const tokens = await client.authorizationCodeGrant(config, url, {
    pkceCodeVerifier: codeVerifier,
    expectedState,
    redirectUri: callbackUrl,
  });

  const claims = tokens.claims();
  if (!claims) {
    return NextResponse.redirect(new URL('/api/login', req.url));
  }

  const session = await getIronSession<AppSession>(cookieStore, sessionOptions);
  session.user = {
    id: String(claims.sub),
    email: (claims.email as string) ?? null,
    firstName: (claims.first_name as string) ?? null,
    lastName: (claims.last_name as string) ?? null,
    profileImageUrl: (claims.profile_image_url as string) ?? null,
  };
  session.accessToken = tokens.access_token;
  session.refreshToken = tokens.refresh_token;
  session.expiresAt = claims.exp;
  await session.save();

  const locale = cookieStore.get('NEXT_LOCALE')?.value ?? 'en';
  return NextResponse.redirect(new URL(`/${locale}/app`, req.url));
}
