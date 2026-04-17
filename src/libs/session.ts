import type { SessionOptions } from 'iron-session';

export type SessionUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
};

export type AppSession = {
  user?: SessionUser;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
};

export const sessionOptions: SessionOptions = {
  cookieName: 'replit_session',
  password: process.env.SESSION_SECRET!,
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
  },
};
