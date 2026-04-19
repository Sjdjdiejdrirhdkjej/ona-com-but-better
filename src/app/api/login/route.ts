import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { buildReplitLoginUrl, getAppBaseUrl, getRedirectUri, getReplitOidcConfig, getSafeReturnPath, getSession } from '@/libs/ReplitAuth';
import { AppConfig } from '@/utils/AppConfig';

function getSignInPath(returnTo: string) {
  const firstPathSegment = returnTo.split('/').filter(Boolean)[0];
  const locale = AppConfig.locales.includes(firstPathSegment || '') ? firstPathSegment : AppConfig.defaultLocale;
  return locale === AppConfig.defaultLocale ? '/sign-in' : `/${locale}/sign-in`;
}

export async function GET(request: NextRequest) {
  const baseUrl = getAppBaseUrl(request);
  const returnTo = getSafeReturnPath(request.nextUrl.searchParams.get('returnTo'), baseUrl);

  try {
    const redirectUri = getRedirectUri(baseUrl);
    const config = await getReplitOidcConfig(redirectUri);
    const { url, state, nonce, codeVerifier } = await buildReplitLoginUrl(config, redirectUri);

    const session = await getSession();
    session.oidcState = state;
    session.oidcNonce = nonce;
    session.codeVerifier = codeVerifier;
    session.returnTo = returnTo;
    session.authOrigin = baseUrl;
    await session.save();

    return NextResponse.redirect(url);
  } catch (err) {
    console.error('Login error:', { err, baseUrl, returnTo });
    const fallback = new URL(getSignInPath(returnTo), baseUrl);
    fallback.searchParams.set('error', 'login_failed');
    fallback.searchParams.set('returnTo', returnTo);
    return NextResponse.redirect(fallback);
  }
}
