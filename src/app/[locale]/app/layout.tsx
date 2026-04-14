import { setRequestLocale } from 'next-intl/server';
import Link from 'next/link';

export default async function AppLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return (
    <div className="flex h-screen flex-col" style={{ backgroundColor: '#f7f6f2' }}>
      <header
        className="flex h-14 flex-shrink-0 items-center justify-between border-b border-black/8 px-5"
        style={{ backgroundColor: 'rgba(247,246,242,0.92)', backdropFilter: 'blur(14px)' }}
      >
        <Link href="/" className="text-base font-bold tracking-tight text-gray-950">
          ONA
        </Link>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>Background Agents</span>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        {props.children}
      </main>
    </div>
  );
}
