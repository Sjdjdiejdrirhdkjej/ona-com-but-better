import { getServerSession } from 'next-auth';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { SessionProvider } from '@/components/SessionProvider';
import { authOptions } from '@/libs/auth';

export default async function AppLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }

  return (
    <SessionProvider initialSession={session}>
      <div style={{ height: '100dvh', backgroundColor: 'var(--bg)' }}>
        {props.children}
      </div>
    </SessionProvider>
  );
}
