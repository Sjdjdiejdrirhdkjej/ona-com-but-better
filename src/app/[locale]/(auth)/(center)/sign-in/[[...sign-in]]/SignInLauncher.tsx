'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSafeBrowserReturnPath, isMobileBrowser, navigateTopLevel } from '@/utils/browserCompat';

type SignInLauncherProps = {
  errorMessage?: string;
  href: string;
  label: string;
  returnTo: string;
  showContinue?: boolean;
};

type SignInStatus = 'idle' | 'waiting' | 'blocked' | 'timeout' | 'checking' | 'failed';

const MAX_SESSION_CHECKS = 45;
const SESSION_CHECK_INTERVAL_MS = 2000;
const AUTH_EVENT_CHANNEL = 'ona-auth-handoff';
const AUTH_COMPLETE_STORAGE_KEY = 'ona-auth-complete';
const AUTH_ERROR_STORAGE_KEY = 'ona-auth-error';

export function SignInLauncher({ errorMessage, href, label, returnTo, showContinue = false }: SignInLauncherProps) {
  const [status, setStatus] = useState<SignInStatus>('idle');
  const [attempts, setAttempts] = useState(0);
  const [handoffError, setHandoffError] = useState<string | null>(errorMessage || null);
  const attemptsRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const handoffHref = href.includes('?') ? `${href}&handoff=1` : `${href}?handoff=1`;

  const clearPendingCheck = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const checkSession = useCallback(async (scheduleNext = true) => {
    if (scheduleNext) {
      clearPendingCheck();
    }

    try {
      const response = await fetch('/api/auth/user?optional=1', {
        cache: 'no-store',
        credentials: 'same-origin',
      });

      if (response.ok) {
        const user = await response.json();
        if (user) {
          const nextPath = getSafeBrowserReturnPath(returnTo, returnTo);
          navigateTopLevel(nextPath, 'replace');
          return;
        }
      }
    } catch {
    }

    if (!scheduleNext) {
      setStatus(current => (current === 'checking' ? 'idle' : current));
      return;
    }

    attemptsRef.current += 1;
    setAttempts(attemptsRef.current);

    if (attemptsRef.current >= MAX_SESSION_CHECKS) {
      setStatus('timeout');
      return;
    }

    timeoutRef.current = window.setTimeout(() => {
      void checkSession(true);
    }, SESSION_CHECK_INTERVAL_MS);
  }, [clearPendingCheck, returnTo]);

  const startWaiting = useCallback(() => {
    attemptsRef.current = 0;
    setAttempts(0);
    setStatus('waiting');
    void checkSession(true);
  }, [checkSession]);

  function startAuth() {
    const authWindow = window.open('about:blank', 'ona-replit-auth', 'popup=yes,width=520,height=720');

    if (!authWindow) {
      setStatus('blocked');
      return;
    }

    try {
      authWindow.opener = null;
      authWindow.location.replace(handoffHref);
      authWindow.focus();
    } catch {
      setStatus('blocked');
      return;
    }

    startWaiting();
  }

  useEffect(() => {
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(AUTH_EVENT_CHANNEL) : null;

    function handleAuthComplete(nextReturnTo: string) {
      const nextPath = getSafeBrowserReturnPath(nextReturnTo, returnTo);
      navigateTopLevel(nextPath, 'replace');
    }

    function handleAuthError(message: string) {
      clearPendingCheck();
      setHandoffError(message);
      setStatus('failed');
    }

    function handleChannelMessage(event: MessageEvent) {
      if (event.data?.type === 'ona-auth-complete') {
        handleAuthComplete(typeof event.data.returnTo === 'string' ? event.data.returnTo : returnTo);
      } else if (event.data?.type === 'ona-auth-error' && typeof event.data.message === 'string') {
        handleAuthError(event.data.message);
      }
    }

    function handleStorage(event: StorageEvent) {
      if ((event.key !== AUTH_ERROR_STORAGE_KEY && event.key !== AUTH_COMPLETE_STORAGE_KEY) || !event.newValue) {
        return;
      }

      try {
        const data = JSON.parse(event.newValue);
        if (data?.type === 'ona-auth-complete') {
          handleAuthComplete(typeof data.returnTo === 'string' ? data.returnTo : returnTo);
        } else if (data?.type === 'ona-auth-error' && typeof data.message === 'string') {
          handleAuthError(data.message);
        }
      } catch {
      }
    }

    channel?.addEventListener('message', handleChannelMessage);
    window.addEventListener('storage', handleStorage);

    if (errorMessage) {
      const payload = { type: 'ona-auth-error', message: errorMessage, ts: Date.now() };
      channel?.postMessage(payload);
      try {
        window.localStorage.setItem(AUTH_ERROR_STORAGE_KEY, JSON.stringify(payload));
      } catch {
      }
    }

    return () => {
      channel?.removeEventListener('message', handleChannelMessage);
      channel?.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, [clearPendingCheck, errorMessage, returnTo]);

  useEffect(() => {
    if (!errorMessage && !isMobileBrowser()) {
      navigateTopLevel(href, 'replace');
      return;
    }

    void checkSession(false);

    function checkWhenVisible() {
      if (document.visibilityState === 'visible') {
        setStatus(current => (current === 'idle' ? 'checking' : current));
        void checkSession(false);
      }
    }

    window.addEventListener('focus', checkWhenVisible);
    document.addEventListener('visibilitychange', checkWhenVisible);

    return () => {
      clearPendingCheck();
      window.removeEventListener('focus', checkWhenVisible);
      document.removeEventListener('visibilitychange', checkWhenVisible);
    };
  }, [checkSession, clearPendingCheck, errorMessage, href]);

  const progressText = status === 'waiting'
    ? `Waiting for Replit sign-in to finish${attempts > 0 ? ` (${attempts}/${MAX_SESSION_CHECKS})` : ''}. Keep this tab open.`
    : status === 'blocked'
      ? 'Your browser blocked the sign-in tab. Use the link below to open Replit sign-in, then return here.'
      : status === 'timeout'
        ? 'We could not detect a completed sign-in yet. You can try again or continue in this tab.'
        : status === 'failed'
          ? handoffError || 'Replit sign-in could not be completed. You can try again or continue in this tab.'
          : status === 'checking'
            ? 'Checking whether you are already signed in…'
            : 'Replit sign-in will open separately so this ONA tab stays available.';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
      <button
        type="button"
        onClick={startAuth}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px 24px',
          backgroundColor: '#18182a',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '15px',
          fontWeight: 500,
          textDecoration: 'none',
          cursor: 'pointer',
        }}
      >
        {status === 'waiting' ? 'Replit sign-in is open…' : label}
      </button>

      <p aria-live="polite" style={{ color: '#666', fontSize: '14px', lineHeight: 1.5, margin: 0, maxWidth: '380px' }}>
        {progressText}
      </p>

      {(status === 'blocked' || status === 'timeout' || status === 'failed' || showContinue) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px' }}>
          {(status === 'blocked' || status === 'timeout' || status === 'failed') && (
            <>
              <a
                href={handoffHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={startWaiting}
                style={{ color: '#18182a', fontSize: '14px', fontWeight: 600 }}
              >
                Open Replit sign-in
              </a>
              <button
                type="button"
                onClick={() => {
                  setStatus('checking');
                  void checkSession(false);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#18182a',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                I finished sign-in
              </button>
            </>
          )}
          <a href={returnTo} target="_top" style={{ color: '#18182a', fontSize: '14px', fontWeight: 600 }}>
            Continue in current tab
          </a>
        </div>
      )}
    </div>
  );
}