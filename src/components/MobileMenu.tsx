'use client';

import Link from 'next/link';
import { useState } from 'react';

const navLinks = [
  { label: 'Platform', href: '/about/' },
  { label: 'Use cases', href: '/portfolio/' },
  { label: 'Resources', href: '/counter/' },
  { label: 'Blog', href: '/about/' },
  { label: 'Docs', href: '/about/' },
  { label: 'Pricing', href: '/about/' },
];

const BG = '#f7f6f2';

export function MobileMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(prev => !prev)}
        aria-label="Toggle menu"
        className="flex size-9 items-center justify-center rounded-md text-gray-700 hover:bg-black/5 transition-colors"
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
          className="absolute left-0 right-0 top-14 z-40 border-b border-gray-200 px-6 pb-6 pt-4 shadow-sm"
          style={{ backgroundColor: BG }}
        >
          <nav>
            <ul className="space-y-1">
              {navLinks.map(link => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-md px-3 py-2.5 text-base font-medium text-gray-700 hover:bg-black/5 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-2 border-t border-gray-200 pt-4">
              <Link
                href="/sign-in/"
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-base font-medium text-gray-700 hover:bg-black/5 transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up/"
                onClick={() => setOpen(false)}
                className="rounded-md bg-gray-950 px-3 py-2.5 text-center text-base font-medium text-white transition-opacity hover:opacity-80"
              >
                Request a demo
              </Link>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
