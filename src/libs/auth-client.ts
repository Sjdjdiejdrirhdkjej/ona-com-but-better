'use client';

export type SessionUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  credits?: number;
};

export function useAuth() {
  return {
    user: null as SessionUser | null,
    isLoading: false,
    isAuthenticated: false,
  };
}

export function signIn() {
  window.location.href = '/app';
}

export function signOut() {
  window.location.href = '/';
}
