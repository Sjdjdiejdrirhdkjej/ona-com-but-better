'use client';

import { useEffect, useState } from 'react';
import { signOut } from '@/libs/auth-client';
import type { SessionUser } from '@/libs/auth-client';

function getInitials(user: SessionUser): string {
  const f = (user.firstName ?? '').trim();
  const l = (user.lastName ?? '').trim();
  if (f || l) return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase().replace(/\s/g, '') || '?';
  const e = (user.email ?? '').trim();
  return e ? e.charAt(0).toUpperCase() : '?';
}

function getDisplayName(user: SessionUser): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return full || user.email || 'Account';
}

export default function UserProfilePage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
    fetch('/api/auth/user')
      .then(res => (res.ok ? res.json() : null))
      .then((data: SessionUser | null) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch {}
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="size-6 rounded-full border-2 border-gray-300 border-t-gray-700 dark:border-gray-700 dark:border-t-gray-300 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center px-4">
        <p className="text-gray-600 dark:text-gray-400">You are not signed in.</p>
        <a href="/sign-in" className="rounded-lg bg-gray-900 dark:bg-gray-100 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 transition-opacity hover:opacity-80">
          Sign in
        </a>
      </div>
    );
  }

  const initials = getInitials(user);
  const displayName = getDisplayName(user);

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-8 text-2xl font-semibold text-gray-900 dark:text-gray-100">Settings</h1>

      <div className="space-y-4">
        <section
          className="rounded-2xl border border-black/8 dark:border-white/10 p-6"
          style={{ backgroundColor: 'var(--bg-card)' }}
        >
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Profile</h2>
          <div className="flex items-center gap-4">
            {user.profileImageUrl
              ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.profileImageUrl}
                    alt={displayName}
                    className="size-14 rounded-full object-cover ring-2 ring-black/8 dark:ring-white/10"
                  />
                )
              : (
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-gray-900 dark:bg-gray-100 text-lg font-semibold text-white dark:text-gray-900">
                    {initials}
                  </span>
                )}
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-gray-900 dark:text-gray-100">{displayName}</p>
              {user.email && (
                <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
              )}
              <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500">ID: {user.id}</p>
            </div>
          </div>
        </section>

        <section
          className="rounded-2xl border border-black/8 dark:border-white/10 p-6"
          style={{ backgroundColor: 'var(--bg-card)' }}
        >
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Appearance</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Dark mode</p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Switch between light and dark theme</p>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              aria-pressed={dark}
              aria-label="Toggle dark mode"
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-100 focus:ring-offset-2 ${
                dark ? 'bg-gray-900 dark:bg-gray-100' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block size-5 rounded-full bg-white dark:bg-gray-900 shadow ring-0 transition-transform duration-200 ease-in-out ${
                  dark ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </section>

        <section
          className="rounded-2xl border border-black/8 dark:border-white/10 p-6"
          style={{ backgroundColor: 'var(--bg-card)' }}
        >
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Account</h2>
          <button
            type="button"
            onClick={() => signOut()}
            className="flex w-full items-center gap-2 rounded-xl border border-black/8 dark:border-white/10 px-4 py-3 text-sm text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
            style={{ backgroundColor: 'var(--bg)' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M6 2H3a1 1 0 00-1 1v8a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M9 4.5L11.5 7 9 9.5M11.5 7H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Sign out
          </button>
        </section>
      </div>
    </div>
  );
}
