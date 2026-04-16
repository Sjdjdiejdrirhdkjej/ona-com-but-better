import { auth } from '@clerk/nextjs/server';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

export default async function AppLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }

  return (
    <div style={{ height: '100dvh', backgroundColor: 'var(--bg)' }}>
      {props.children}
    </div>
  );
}
