import { STATE_COOKIE, TOKEN_COOKIE, USER_COOKIE } from '@/libs/GitHub';

export const runtime = 'nodejs';

export async function POST() {
  const res = Response.json({ ok: true });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  for (const key of [TOKEN_COOKIE, USER_COOKIE, STATE_COOKIE]) {
    res.headers.append('Set-Cookie', `${key}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  }
  return res;
}
