import { setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { BaseTemplate } from '@/templates/BaseTemplate';
import { AppConfig } from '@/utils/AppConfig';

function getSignInHref(locale: string) {
  const signInPath = locale === AppConfig.defaultLocale ? '/sign-in' : `/${locale}/sign-in`;
  const returnTo = locale === AppConfig.defaultLocale ? '/app' : `/${locale}/app`;
  return `${signInPath}?returnTo=${encodeURIComponent(returnTo)}`;
}

export default async function Layout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const loginHref = getSignInHref(locale);

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
            <Link href="/about/" className="rounded-md px-3 py-1.5 transition-colors hover:bg-black/5">
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
          <a
            href={loginHref}
            target="_top"
            className="rounded-md border border-gray-900 px-3 py-1.5 text-gray-900 transition-colors hover:bg-gray-900 hover:text-white"
          >
            Get Started
          </a>
        </>
      )}
    >
      {props.children}
    </BaseTemplate>
  );
}
