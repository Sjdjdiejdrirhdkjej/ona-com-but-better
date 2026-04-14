'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';

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
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setPrompt('');
    inputRef.current?.blur();
    setOpen(false);
  }

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(prev => !prev)}
        aria-label="Toggle menu"
        className="flex size-9 items-center justify-center rounded-md text-gray-700 transition-colors hover:bg-black/5"
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
          className="absolute left-0 right-0 top-14 z-40 border-b border-gray-200 px-5 pb-5 pt-4 shadow-sm"
          style={{ backgroundColor: BG }}
        >
          <nav>
            <ul className="space-y-1">
              {navLinks.map(link => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-md px-3 py-2.5 text-base font-medium text-gray-700 transition-colors hover:bg-black/5"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-col gap-2 border-t border-gray-200 pt-4">
              {/* Prompt box */}
              <form onSubmit={handleSubmit} className="relative flex items-center">
                <input
                  ref={inputRef}
                  type="text"
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="Ask anything…"
                  className="h-10 w-full rounded-full border border-gray-300 bg-white/80 pl-4 pr-11 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 focus:bg-white focus:shadow-sm"
                />
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={!prompt.trim()}
                  className="absolute right-2 flex size-6 items-center justify-center rounded-full bg-gray-900 text-white transition-opacity hover:opacity-80 disabled:opacity-30"
                >
                  <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
                    <path d="M5 8.5V1.5M5 1.5L2 4.5M5 1.5L8 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </form>

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
