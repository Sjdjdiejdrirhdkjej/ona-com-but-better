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
  delete session.oidcNonce;
  delete session.codeVerifier;
  delete session.returnTo;
  delete session.authOrigin;
  await session.save();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] || char);
}

function authCompleteResponse(baseUrl: string, returnTo: string) {
  const destination = new URL(returnTo, baseUrl).toString();
  const origin = new URL(baseUrl).origin;
  const body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Returning to ONA</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f7f6f2;color:#18182a;font-family:Arial,sans-serif}
    main{max-width:380px;padding:32px;text-align:center}
    h1{font-family:Georgia,serif;font-size:24px;margin:0 0 10px}
    p{color:#666;line-height:1.5;margin:0 0 24px}
    a{display:inline-flex;align-items:center;justify-content:center;padding:12px 24px;border-radius:8px;background:#18182a;color:white;text-decoration:none;font-weight:600}
    .muted{font-size:13px;color:#777}
  </style>
</head>
<body>
  <main>
    <h1>You are signed in</h1>
    <p>Your ONA tab should continue automatically. If it does not, use the button below.</p>
    <a href="${escapeHtml(destination)}" target="_top" rel="noreferrer">Continue to ONA</a>
    <p class="muted">It is safe to return to the original ONA tab.</p>
  </main>
  <script>
    const destination = ${JSON.stringify(destination)};
    const origin = ${JSON.stringify(origin)};
    const returnTo = ${JSON.stringify(returnTo)};
    const userAgent = navigator.userAgent || '';
    const isMobileBrowser = /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(userAgent);

    function navigateCurrentTab() {
      try {
        if (window.top && window.top !== window.self) {
          window.top.location.replace(destination);
          return;
        }
      } catch {}

      window.location.replace(destination);
    }

    function canUseDesktopPopupHandoff() {
      return !isMobileBrowser && window.opener && !window.opener.closed;
    }

    try {
      if (canUseDesktopPopupHandoff()) {
        window.opener.postMessage({ type: 'ona-auth-complete', returnTo }, origin);
        window.close();
        window.setTimeout(navigateCurrentTab, 300);
      } else if (!isMobileBrowser) {
        window.setTimeout(navigateCurrentTab, 1500);
      }
    } catch {
      if (!isMobileBrowser) {
        window.setTimeout(navigateCurrentTab, 1500);
      }
    }

  </script>
</body>
</html>`;

  return new NextResponse(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function GET(request: NextRequest) {
  const requestBaseUrl = getAppBaseUrl(request);

  try {
    const session = await getSession();
    const { oidcState, oidcNonce, codeVerifier, authOrigin } = session;
    const baseUrl = authOrigin || requestBaseUrl;
    const returnTo = getSafeReturnPath(session.returnTo, baseUrl);

    if (request.nextUrl.searchParams.has('error')) {
      await clearAuthAttempt(session);
      return signInRedirect(baseUrl, 'provider_error', returnTo);
    }

    if (!oidcState || !oidcNonce || !codeVerifier) {
      await clearAuthAttempt(session);
      return signInRedirect(baseUrl, 'session_expired', returnTo);
    }

    const redirectUri = getRedirectUri(baseUrl);
    const config = await getReplitOidcConfig(redirectUri);
    const currentUrl = new URL(`${redirectUri}${request.nextUrl.search}`);

    const tokens = await authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedState: oidcState,
      expectedNonce: oidcNonce,
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
    delete session.oidcNonce;
    delete session.codeVerifier;
    delete session.returnTo;
    delete session.authOrigin;
    await session.save();

    return authCompleteResponse(baseUrl, returnTo);
  } catch (err) {
    console.error('OIDC callback error:', err);
    const session = await getSession();
    const baseUrl = session.authOrigin || requestBaseUrl;
    const returnTo = getSafeReturnPath(session.returnTo, baseUrl);
    await clearAuthAttempt(session);
    return signInRedirect(baseUrl, 'callback_failed', returnTo);
  }
}
