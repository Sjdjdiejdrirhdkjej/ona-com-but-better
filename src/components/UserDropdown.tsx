'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { signOut, useAuth } from '@/libs/auth-client';

function getInitials(firstName: string | null, lastName: string | null, email: string | null): string {
  const f = (firstName ?? '').trim();
  const l = (lastName ?? '').trim();
  if (f || l) {
    return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase() || '?';
  }
  const e = (email ?? '').trim();
  if (e) {
    return e.charAt(0).toUpperCase();
  }
  return '?';
}

function getDisplayName(firstName: string | null, lastName: string | null, email: string | null): string {
  const full = [firstName, lastName].filter(Boolean).join(' ').trim();
  return full || email || 'Account';
}

export function UserDropdown() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  if (isLoading) {
    return (
      <div
        aria-hidden="true"
        className="size-8 animate-pulse rounded-full bg-black/5 dark:bg-white/10"
      />
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  const initials = getInitials(user.firstName, user.lastName, user.email);
  const displayName = getDisplayName(user.firstName, user.lastName, user.email);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open account menu"
        className="flex size-8 items-center justify-center rounded-full ring-1 ring-black/10 transition-opacity hover:opacity-85 dark:ring-white/10"
      >
        {user.profileImageUrl
          ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.profileImageUrl}
                alt={displayName}
                className="size-8 rounded-full object-cover"
              />
            )
          : (
              <span className="flex size-8 items-center justify-center rounded-full bg-gray-900 text-[11px] font-semibold text-white dark:bg-gray-100 dark:text-gray-900">
                {initials}
              </span>
            )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-black/5 shadow-lg dark:border-white/10"
          style={{ backgroundColor: 'var(--bg-card)' }}
        >
          <div className="flex items-center gap-2.5 border-b border-black/5 px-3 py-2.5 dark:border-white/8">
            {user.profileImageUrl
              ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.profileImageUrl}
                    alt={displayName}
                    className="size-8 shrink-0 rounded-full object-cover"
                  />
                )
              : (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[11px] font-semibold text-white dark:bg-gray-100 dark:text-gray-900">
                    {initials}
                  </span>
                )}
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">{displayName}</p>
              {user.email && (
                <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{user.email}</p>
              )}
            </div>
          </div>

          <div className="py-1">
            <Link
              href="/dashboard/user-profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs text-gray-700 transition-colors hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/8"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M7 9a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.3" />
                <path d="M11.6 8.4a1 1 0 00.2-1.1l-.4-.7a1 1 0 01.1-1.1l.4-.4a1 1 0 000-1.4l-.6-.6a1 1 0 00-1.4 0l-.4.4a1 1 0 01-1.1.1l-.7-.4a1 1 0 00-1.1.2l-.6.6a1 1 0 00-.2 1.1l.4.7a1 1 0 01-.1 1.1l-.4.4a1 1 0 000 1.4l.6.6a1 1 0 001.4 0l.4-.4a1 1 0 011.1-.1l.7.4a1 1 0 001.1-.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Settings
            </Link>
            <Link
              href="/dashboard"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs text-gray-700 transition-colors hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/8"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <rect x="2" y="2" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="7.5" y="2" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="2" y="7.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="7.5" y="7.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
              </svg>
              Dashboard
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                signOut();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/8"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M6 2H3a1 1 0 00-1 1v8a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M9 4.5L11.5 7 9 9.5M11.5 7H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
