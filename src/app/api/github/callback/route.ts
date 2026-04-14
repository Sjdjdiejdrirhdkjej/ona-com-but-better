import { getGitHubConfig, getGitHubRedirectUri, getGitHubViewer, makeCookieOptions, STATE_COOKIE, TOKEN_COOKIE, USER_COOKIE } from '@/libs/GitHub';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

type TokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

function appRedirect(req: Request, params: Record<string, string>) {
  const url = new URL('/app', req.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function GET(req: Request) {
  const config = getGitHubConfig();
  if (!config.configured || !config.clientId || !config.clientSecret) {
    return Response.redirect(appRedirect(req, { github: 'not_configured' }));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return Response.redirect(appRedirect(req, { github: 'invalid_state' }));
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: getGitHubRedirectUri(req),
    }),
  });

  const tokenData = await tokenRes.json() as TokenResponse;
  if (!tokenRes.ok || !tokenData.access_token) {
    return Response.redirect(appRedirect(req, { github: tokenData.error ?? 'token_failed' }));
  }

  const user = await getGitHubViewer(tokenData.access_token);
  const res = Response.redirect(appRedirect(req, { github: 'connected' }));
  const tokenOptions = makeCookieOptions(60 * 60 * 24 * 30);
  const userOptions = makeCookieOptions(60 * 60 * 24 * 30);
  res.headers.append('Set-Cookie', `${TOKEN_COOKIE}=${tokenData.access_token}; Path=${tokenOptions.path}; HttpOnly; SameSite=Lax; Max-Age=${tokenOptions.maxAge}${tokenOptions.secure ? '; Secure' : ''}`);
  res.headers.append('Set-Cookie', `${USER_COOKIE}=${encodeURIComponent(JSON.stringify({ login: user.login, avatar_url: user.avatar_url, html_url: user.html_url, name: user.name }))}; Path=${userOptions.path}; HttpOnly; SameSite=Lax; Max-Age=${userOptions.maxAge}${userOptions.secure ? '; Secure' : ''}`);
  res.headers.append('Set-Cookie', `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  return res;
}
