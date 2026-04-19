import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getUser } from '@/libs/auth';
import { AppConfig } from '@/utils/AppConfig';

export default async function AppLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const user = await getUser();
  if (!user) {
    const appPath = locale === AppConfig.defaultLocale ? '/app' : `/${locale}/app`;
    redirect(`/api/login?returnTo=${encodeURIComponent(appPath)}`);
  }

  return (
    <div style={{ height: '100dvh', backgroundColor: 'var(--bg)' }}>
      {props.children}
    </div>
  );
}
