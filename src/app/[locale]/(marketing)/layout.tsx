import { setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { NavPromptBox } from '@/components/NavPromptBox';
import { BaseTemplate } from '@/templates/BaseTemplate';

export default async function Layout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return (
    <BaseTemplate
      leftNav={(
        <>
          <li>
            <Link href="/about/" className="rounded-md px-3 py-1.5 transition-colors hover:bg-black/5">
              Platform
            </Link>
          </li>
          <li>
            <Link href="/portfolio/" className="rounded-md px-3 py-1.5 transition-colors hover:bg-black/5">
              Use cases
            </Link>
          </li>
          <li>
            <Link href="/counter/" className="rounded-md px-3 py-1.5 transition-colors hover:bg-black/5">
              Resources
            </Link>
          </li>
          <li>
            <Link href="/about/" className="rounded-md px-3 py-1.5 transition-colors hover:bg-black/5">
              Blog
            </Link>
          </li>
          <li>
            <Link href="/about/" className="rounded-md px-3 py-1.5 transition-colors hover:bg-black/5">
              Docs
            </Link>
          </li>
          <li>
            <Link href="/about/" className="rounded-md px-3 py-1.5 transition-colors hover:bg-black/5">
              Pricing
            </Link>
          </li>
        </>
      )}
      rightNav={(
        <>
          <NavPromptBox />
          <Link
            href="/sign-up/"
            className="rounded-md border border-gray-900 px-3 py-1.5 text-gray-900 transition-colors hover:bg-gray-900 hover:text-white"
          >
            Request a demo
          </Link>
        </>
      )}
    >
      {props.children}
    </BaseTemplate>
  );
}
