import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { getUser } from '@/libs/auth';
import { SessionProvider } from '@/components/SessionProvider';

export default async function AppLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const user = await getUser();
  if (!user) {
    redirect('/api/login');
  }

  return (
    <SessionProvider>
      <div style={{ height: '100dvh', backgroundColor: 'var(--bg)' }}>
        {props.children}
      </div>
    </SessionProvider>
  );
}
