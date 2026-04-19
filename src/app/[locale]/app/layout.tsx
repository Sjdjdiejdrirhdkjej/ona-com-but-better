import { setRequestLocale } from 'next-intl/server';

export default async function AppLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return (
    <div style={{ height: '100dvh', backgroundColor: 'var(--bg)' }}>
      {props.children}
    </div>
  );
}
