import { setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { BaseTemplate } from '@/templates/BaseTemplate';
import { AppConfig } from '@/utils/AppConfig';

function getSignInHref(locale: string) {
  const returnTo = locale === AppConfig.defaultLocale ? '/app' : `/${locale}/app`;
  const signInPath = locale === AppConfig.defaultLocale ? '/sign-in' : `/${locale}/sign-in`;
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
            <Link href="/about/" className="rounded-[4px] px-3 py-1.5 transition-colors hover:bg-black/5">
              Platform
            </Link>
          </li>
          <li>
            <Link href="/portfolio/" className="rounded-[4px] px-3 py-1.5 transition-colors hover:bg-black/5">
              Use cases
            </Link>
          </li>
          <li>
            <Link href="/about/" className="rounded-[4px] px-3 py-1.5 transition-colors hover:bg-black/5">
              Resources
            </Link>
          </li>
          <li>
            <Link href="/about/" className="rounded-[4px] px-3 py-1.5 transition-colors hover:bg-black/5">
              Blog
            </Link>
          </li>
          <li>
            <Link href="/about/" className="rounded-[4px] px-3 py-1.5 transition-colors hover:bg-black/5">
              Docs
            </Link>
          </li>
          <li>
            <Link href="/about/" className="rounded-[4px] px-3 py-1.5 transition-colors hover:bg-black/5">
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
            rel="noreferrer"
            className="rounded-[4px] bg-neutral-950 px-3 py-1.5 text-white transition-opacity hover:opacity-80 dark:bg-neutral-100 dark:text-neutral-950"
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
