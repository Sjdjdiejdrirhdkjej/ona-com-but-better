import { setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { GetStartedLink } from '@/components/GetStartedLink';
import { BaseTemplate } from '@/templates/BaseTemplate';

export default async function Layout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return (
    <div
      className="[--bg:#f2ede3] [--bg-2:#e8e2d6] [--bg-3:#ddd6c8] [--bg-header:rgba(242,237,227,0.92)] [--text:#171717] [--header-grid:rgba(0,0,0,0.08)] dark:[--bg:#0b0b0d] dark:[--bg-2:#111216] dark:[--bg-3:#17181d] dark:[--bg-header:rgba(11,11,13,0.9)] dark:[--text:#f5f5f5] dark:[--header-grid:rgba(255,255,255,0.08)]"
    >
      <BaseTemplate
        leftNav={(
          <>
            <li>
              <Link href="/about/" className="rounded-[4px] px-3 py-1.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10">
                Platform
              </Link>
            </li>
            <li>
              <Link href="/portfolio/" className="rounded-[4px] px-3 py-1.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10">
                Use cases
              </Link>
            </li>
            <li>
              <Link href="/about/" className="rounded-[4px] px-3 py-1.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10">
                Models
              </Link>
            </li>
            <li>
              <Link href="/about/" className="rounded-[4px] px-3 py-1.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10">
                Blog
              </Link>
            </li>
            <li>
              <Link href="/about/" className="rounded-[4px] px-3 py-1.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10">
                Pricing
              </Link>
            </li>
          </>
        )}
        rightNav={(
          <>
            <Link
              href="/dashboard"
              className="rounded-[4px] px-3 py-1.5 text-neutral-700 transition-colors hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-white"
            >
              Sign In
            </Link>
            <GetStartedLink
              className="rounded-[4px] bg-neutral-950 px-3 py-1.5 text-white transition-opacity hover:opacity-80 dark:bg-white dark:text-neutral-950"
              locale={locale}
            >
              Get Started
            </GetStartedLink>
          </>
        )}
      >
        {props.children}
      </BaseTemplate>
    </div>
  );
}
