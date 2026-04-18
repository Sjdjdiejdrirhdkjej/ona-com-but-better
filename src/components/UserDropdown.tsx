'use client';

import { useRef, useState } from 'react';
import { signOut, useAuth } from '@/libs/auth-client';

export function UserDropdown() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  if (!user) return null;

  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
  const initial = (name ?? 'U')[0]?.toUpperCase() ?? 'U';

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
      <div ref={ref} className="relative z-40">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 rounded-lg border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-300 transition-colors hover:bg-black/6 dark:hover:bg-white/8"
          aria-label="User menu"
        >
          {user.profileImageUrl
            ? (
                <img
                  src={user.profileImageUrl}
                  alt={name ?? ''}
                  className="size-6 rounded-full"
                />
              )
            : (
                <div
                  className="flex size-6 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: 'linear-gradient(135deg,#7b68ee,#9370db)' }}
                >
                  {initial}
                </div>
              )}
          <span className="hidden max-w-[120px] truncate sm:block">{name}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="currentColor"
            className="text-gray-400 dark:text-gray-500"
            aria-hidden="true"
          >
            <path d="M6 8L2 4h8L6 8z" />
          </svg>
        </button>

        {open && (
          <div
            className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-black/10 dark:border-white/10 shadow-xl"
            style={{ backgroundColor: 'var(--bg)' }}
          >
            <div className="border-b border-black/8 dark:border-white/8 px-3.5 py-2.5">
              <p className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">{name}</p>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
              <p className="mt-1 truncate text-xs font-medium text-gray-700 dark:text-gray-300">
                {user.credits ?? 0} credits
              </p>
            </div>
            <div className="p-1">
              <button
                type="button"
                onClick={signOut}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 dark:text-gray-400 transition-colors hover:bg-black/6 dark:hover:bg-white/8 hover:text-gray-900 dark:hover:text-gray-100"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M5 2H3a1 1 0 00-1 1v8a1 1 0 001 1h2M9.5 9.5L12 7l-2.5-2.5M12 7H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
