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
    <div style={{
      '--bg': '#f2ede3',
      '--bg-2': '#e8e2d6',
      '--bg-3': '#ddd6c8',
      '--bg-header': 'rgba(242, 237, 227, 0.92)',
    } as React.CSSProperties}
    >
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
                Models
              </Link>
            </li>
            <li>
              <Link href="/about/" className="rounded-[4px] px-3 py-1.5 transition-colors hover:bg-black/5">
                Blog
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
            <Link
              href="/dashboard"
              className="rounded-[4px] px-3 py-1.5 text-neutral-700 transition-colors hover:text-neutral-950"
            >
              Sign In
            </Link>
            <GetStartedLink
              className="rounded-[4px] bg-neutral-950 px-3 py-1.5 text-white transition-opacity hover:opacity-80"
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
