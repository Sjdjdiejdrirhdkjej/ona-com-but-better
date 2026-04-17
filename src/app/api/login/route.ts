import * as client from 'openid-client';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const config = await client.discovery(
    new URL('https://replit.com/oidc'),
    process.env.REPL_ID!,
  );

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  const host = req.headers.get('host') ?? '';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const callbackUrl = `${protocol}://${host}/api/callback`;

  const authUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: 'openid email profile offline_access',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  const cookieStore = await cookies();
  cookieStore.set('oidc_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10,
    path: '/',
  });
  cookieStore.set('oidc_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10,
    path: '/',
  });

  return NextResponse.redirect(authUrl.href);
}
