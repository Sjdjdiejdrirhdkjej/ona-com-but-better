import { NextResponse, type NextRequest } from 'next/server';
import { authorizationCodeGrant, getAppBaseUrl, getRedirectUri, getReplitOidcConfig, getSafeReturnPath, getSession } from '@/libs/ReplitAuth';
import { AppConfig } from '@/utils/AppConfig';

function signInRedirect(baseUrl: string, error: string, returnTo?: string) {
  const firstPathSegment = returnTo?.split('/').filter(Boolean)[0];
  const locale = AppConfig.locales.includes(firstPathSegment || '') ? firstPathSegment : AppConfig.defaultLocale;
  const signInPath = locale === AppConfig.defaultLocale ? '/sign-in' : `/${locale}/sign-in`;
  const url = new URL(signInPath, baseUrl);
  url.searchParams.set('error', error);
  if (returnTo) {
    url.searchParams.set('returnTo', returnTo);
  }
  return NextResponse.redirect(url);
}

async function clearAuthAttempt(session: Awaited<ReturnType<typeof getSession>>) {
  delete session.oidcState;
  delete session.codeVerifier;
  delete session.returnTo;
  delete session.authOrigin;
  await session.save();
}

export async function GET(request: NextRequest) {
  const requestBaseUrl = getAppBaseUrl(request);

  try {
    const session = await getSession();
    const { oidcState, codeVerifier, authOrigin } = session;
    const baseUrl = authOrigin || requestBaseUrl;
    const returnTo = getSafeReturnPath(session.returnTo, baseUrl);

    if (request.nextUrl.searchParams.has('error')) {
      await clearAuthAttempt(session);
      return signInRedirect(baseUrl, 'provider_error', returnTo);
    }

    if (!oidcState || !codeVerifier) {
      await clearAuthAttempt(session);
      return signInRedirect(baseUrl, 'session_expired', returnTo);
    }

    const redirectUri = getRedirectUri(baseUrl);
    const config = await getReplitOidcConfig(redirectUri);
    const currentUrl = new URL(`${redirectUri}${request.nextUrl.search}`);

    const tokens = await authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedState: oidcState,
      expectedRedirectUri: redirectUri,
    });

    const claims = tokens.claims();
    if (!claims) {
      await clearAuthAttempt(session);
      return signInRedirect(baseUrl, 'missing_claims', returnTo);
    }

    session.user = {
      id: claims.sub,
      email: (claims.email as string) ?? null,
      firstName: (claims.first_name as string) ?? null,
      lastName: (claims.last_name as string) ?? null,
      profileImageUrl: (claims.profile_image_url as string) ?? null,
    };
    delete session.oidcState;
    delete session.codeVerifier;
    delete session.returnTo;
    delete session.authOrigin;
    await session.save();

    return NextResponse.redirect(new URL(returnTo, baseUrl));
  } catch (err) {
    console.error('OIDC callback error:', err);
    const session = await getSession();
    const baseUrl = session.authOrigin || requestBaseUrl;
    const returnTo = getSafeReturnPath(session.returnTo, baseUrl);
    await clearAuthAttempt(session);
    return signInRedirect(baseUrl, 'callback_failed', returnTo);
  }
}
