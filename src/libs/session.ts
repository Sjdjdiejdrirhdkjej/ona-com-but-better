import type { SessionOptions } from 'iron-session';

export type SessionUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  credits?: number;
};

export type AppSession = {
  user?: SessionUser;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  githubToken?: string;
};

export const sessionOptions: SessionOptions = {
  cookieName: 'replit_session',
  password: process.env.SESSION_SECRET!,
  cookieOptions: {
    secure: true,
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
  },
};
