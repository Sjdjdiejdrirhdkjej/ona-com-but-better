import { getGitHubViewer, pollDeviceToken, tokenCookieHeader, USER_COOKIE } from '@/libs/GitHub';

export const runtime = 'nodejs';

function makeCookieHeader(name: string, value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function POST(req: Request) {
  try {
    const { device_code } = await req.json() as { device_code?: string };
    if (!device_code) {
      return Response.json({ error: 'device_code is required.' }, { status: 400 });
    }

    const result = await pollDeviceToken(device_code);

    if (result.status === 'authorized') {
      const user = await getGitHubViewer(result.access_token);
      const userJson = JSON.stringify({
        login: user.login,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
        name: user.name,
      });
      const maxAge = 60 * 60 * 24 * 30;
      const res = Response.json({ status: 'authorized', user });
      res.headers.append('Set-Cookie', tokenCookieHeader(result.access_token, maxAge));
      res.headers.append('Set-Cookie', makeCookieHeader(USER_COOKIE, encodeURIComponent(userJson), maxAge));
      return res;
    }

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
