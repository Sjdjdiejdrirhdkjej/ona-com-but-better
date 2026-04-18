import * as client from 'openid-client';
import { eq } from 'drizzle-orm';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { db } from '@/libs/DB';
import type { AppSession } from '@/libs/session';
import { sessionOptions } from '@/libs/session';
import { userCreditsSchema } from '@/models/Schema';

const STARTER_CREDITS = 1000;
const DAILY_CREDITS = 300;

export const dynamic = 'force-dynamic';

function getBaseUrl(req: Request): string {
  const host = req.headers.get('host') ?? '';
  const forwardedProto = req.headers.get('x-forwarded-proto');
  const protocol = forwardedProto ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const base = getBaseUrl(req);

  const codeVerifier = cookieStore.get('oidc_code_verifier')?.value;
  const expectedState = cookieStore.get('oidc_state')?.value;

  if (!codeVerifier || !expectedState) {
    return NextResponse.redirect(`${base}/api/login`);
  }

  cookieStore.delete('oidc_code_verifier');
  cookieStore.delete('oidc_state');

  const config = await client.discovery(
    new URL('https://replit.com/oidc'),
    process.env.REPL_ID!,
  );

  const callbackUrl = `${base}/api/callback`;

  const currentUrl = new URL(req.url);
  const callbackRequest = new URL(callbackUrl);
  callbackRequest.search = currentUrl.search;

  const tokens = await client.authorizationCodeGrant(config, callbackRequest, {
    pkceCodeVerifier: codeVerifier,
    expectedState,
    redirectUri: callbackUrl,
  });

  const claims = tokens.claims();
  if (!claims) {
    return NextResponse.redirect(`${base}/api/login`);
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

  // Grant starter + daily credits to new users (only on first login)
  const userId = String(claims.sub);
  const existing = await db
    .select()
    .from(userCreditsSchema)
    .where(eq(userCreditsSchema.userId, userId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(userCreditsSchema).values({
      userId,
      credits: STARTER_CREDITS + DAILY_CREDITS,
    });
  }

  const locale = cookieStore.get('NEXT_LOCALE')?.value ?? 'en';
  return NextResponse.redirect(`${base}/${locale}/app`);
}
