'use client';

import { useEffect, useState } from 'react';

import type { SessionUser } from './session';

export type { SessionUser };

export function useAuth() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/user')
      .then(res => (res.ok ? res.json() : null))
      .then((data) => {
        setUser(data);
        setIsLoading(false);
      })
      .catch(() => {
        setUser(null);
        setIsLoading(false);
      });
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}

export function signIn() {
  window.location.href = '/api/login';
}

export function signOut() {
  window.location.href = '/api/logout';
}
