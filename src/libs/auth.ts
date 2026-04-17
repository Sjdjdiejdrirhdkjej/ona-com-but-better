import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';

import type { AppSession } from './session';
import { sessionOptions } from './session';

export async function getSession(): Promise<AppSession> {
  const cookieStore = await cookies();
  return getIronSession<AppSession>(cookieStore, sessionOptions);
}

export async function getUser() {
  const session = await getSession();
  return session.user ?? null;
}
