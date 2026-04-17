'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';

export function SessionProvider({
  children,
  initialSession,
}: {
  children: React.ReactNode;
  initialSession: Session | null;
}) {
  return (
    <NextAuthSessionProvider session={initialSession}>
      {children}
    </NextAuthSessionProvider>
  );
}
