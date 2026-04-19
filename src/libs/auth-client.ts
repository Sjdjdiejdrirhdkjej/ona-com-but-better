'use client';

import { useEffect, useState } from 'react';
import { AppConfig } from '@/utils/AppConfig';

export type SessionUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
};

export function useAuth() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/user')
      .then(res => (res.ok ? res.json() : null))
      .then((data: SessionUser | null) => {
        setUser(data);
      })
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}

function getLocaleFromPath(path: string) {
  const firstPathSegment = path.split('/').filter(Boolean)[0];
  return AppConfig.locales.includes(firstPathSegment || '') ? firstPathSegment! : AppConfig.defaultLocale;
}

function getLocalizedAppPath(locale: string) {
  return locale === AppConfig.defaultLocale ? '/app' : `/${locale}/app`;
}

function getLocalizedSignInPath(locale: string) {
  return locale === AppConfig.defaultLocale ? '/sign-in' : `/${locale}/sign-in`;
}

export function signIn(returnTo?: string) {
  const locale = getLocaleFromPath(returnTo || window.location.pathname);
  const safeReturnTo = returnTo || getLocalizedAppPath(locale);
  const url = new URL(getLocalizedSignInPath(locale), window.location.origin);
  url.searchParams.set('returnTo', safeReturnTo);

  try {
    if (window.top && window.top !== window.self) {
      window.top.location.assign(url.toString());
      return;
    }
  } catch {
  }

  window.location.assign(url.toString());
}

export function signOut() {
  window.location.assign('/api/logout');
}
