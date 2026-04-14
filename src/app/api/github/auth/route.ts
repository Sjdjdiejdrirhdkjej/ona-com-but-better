import { randomBytes } from 'node:crypto';
import { getGitHubConfig, getGitHubRedirectUri, makeCookieOptions, STATE_COOKIE } from '@/libs/GitHub';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const config = getGitHubConfig();
  if (!config.clientId) {
    return Response.json({ error: 'GitHub OAuth is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.' }, { status: 500 });
  }

  const state = randomBytes(24).toString('hex');
  const redirectUri = getGitHubRedirectUri(req);
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'repo read:user user:email');
  url.searchParams.set('state', state);
  url.searchParams.set('allow_signup', 'true');

  const res = Response.redirect(url.toString());
  res.headers.append('Set-Cookie', `${STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  return res;
}
