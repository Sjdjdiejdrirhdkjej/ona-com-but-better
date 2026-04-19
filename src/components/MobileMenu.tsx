'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AppConfig } from '@/utils/AppConfig';

const navLinks = [
  { label: 'Platform', href: '/about/' },
  { label: 'Use cases', href: '/portfolio/' },
  { label: 'Resources', href: '/counter/' },
  { label: 'Blog', href: '/about/' },
  { label: 'Docs', href: '/about/' },
  { label: 'Pricing', href: '/about/' },
];

function getLoginHref(locale: string) {
  const returnTo = locale === AppConfig.defaultLocale ? '/app' : `/${locale}/app`;
  const signInPath = locale === AppConfig.defaultLocale ? '/sign-in' : `/${locale}/sign-in`;
  return `${signInPath}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const params = useParams<{ locale?: string }>();
  const locale = AppConfig.locales.includes(params.locale || '') ? params.locale! : AppConfig.defaultLocale;
  const loginHref = getLoginHref(locale);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(prev => !prev)}
        aria-label="Toggle menu"
        className="flex size-9 items-center justify-center rounded-[4px] text-gray-700 transition-colors hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/8"
      >
        {open
          ? (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M2 2L16 16M16 2L2 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            )
          : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            )}
      </button>

      {open && (
        <div
          className="amp-grid absolute left-0 right-0 top-14 z-40 border-b border-black/8 px-5 pb-5 pt-4 shadow-sm dark:border-white/10"
          style={{ backgroundColor: 'var(--bg-header)' }}
        >
          <nav>
            <ul className="space-y-1">
              {navLinks.map(link => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-[4px] px-3 py-2.5 text-base font-medium text-gray-700 transition-colors hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/8"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-col gap-2 border-t border-black/8 pt-4 dark:border-white/10">
              <a
                href={loginHref}
                target="_top"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className="rounded-[4px] bg-gray-950 px-3 py-2.5 text-center text-base font-medium text-white transition-opacity hover:opacity-80 dark:bg-gray-100 dark:text-gray-900"
              >
                Get Started
              </a>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
