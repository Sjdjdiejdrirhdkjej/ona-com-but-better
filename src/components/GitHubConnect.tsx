'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { copyTextToClipboard } from '@/utils/browserCompat';

const GH_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

type GitHubUser = {
  login: string;
  name?: string | null;
  avatar_url?: string;
};

type Status =
  | { type: 'idle' }
  | { type: 'checking' }   // silently checking existing connection — no overlay
  | { type: 'loading' }    // user started device flow — shows overlay
  | { type: 'pending'; deviceCode: string; userCode: string; verificationUri: string; interval: number }
  | { type: 'connected'; user: GitHubUser }
  | { type: 'error'; message: string };

export function GitHubConnect() {
  const [status, setStatus] = useState<Status>({ type: 'checking' });
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkConnection = useCallback(async () => {
    try {
      const res = await fetch('/api/github/status');
      if (!res.ok) { setStatus({ type: 'idle' }); return; }
      const data = await res.json() as { configured: boolean; connected: boolean; user?: GitHubUser };
      if (!data.configured) { setStatus({ type: 'idle' }); return; }
      setStatus(data.connected && data.user
        ? { type: 'connected', user: data.user }
        : { type: 'idle' });
    } catch {
      setStatus({ type: 'idle' });
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    checkConnection();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [checkConnection]);

  function stopPolling() {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
  }

  async function startDeviceFlow() {
    setStatus({ type: 'loading' });
    try {
      const res = await fetch('/api/github/device/start', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to start');
      const data = await res.json() as {
        device_code: string;
        user_code: string;
        verification_uri: string;
        interval: number;
      };
      setStatus({
        type: 'pending',
        deviceCode: data.device_code,
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        interval: data.interval,
      });
      schedulePoll(data.device_code, data.interval);
    } catch {
      setStatus({ type: 'error', message: 'Could not reach GitHub. Try again.' });
    }
  }

  function schedulePoll(deviceCode: string, interval: number) {
    pollRef.current = setTimeout(() => doPoll(deviceCode, interval), interval * 1000);
  }

  async function doPoll(deviceCode: string, interval: number) {
    try {
      const res = await fetch('/api/github/device/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: deviceCode }),
      });
      const data = await res.json() as { status: string; error?: string };
      if (data.status === 'authorized') {
        stopPolling();
        await checkConnection();
      } else if (data.status === 'slow_down') {
        schedulePoll(deviceCode, interval + 5);
      } else if (data.status === 'authorization_pending') {
        schedulePoll(deviceCode, interval);
      } else {
        stopPolling();
        setStatus({ type: 'error', message: data.error ?? 'Authorization failed.' });
      }
    } catch {
      schedulePoll(deviceCode, interval);
    }
  }

  async function disconnect() {
    stopPolling();
    await fetch('/api/github/device/disconnect', { method: 'POST' });
    setStatus({ type: 'idle' });
  }

  async function copyCode(code: string) {
    const didCopy = await copyTextToClipboard(code);

    if (didCopy) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function cancelFlow() {
    stopPolling();
    setStatus({ type: 'idle' });
  }

  // 'checking' is the silent initial load — never block the UI with an overlay for it
  const showOverlay = status.type === 'pending' || status.type === 'error' || status.type === 'loading';
  const overlay = showOverlay && mounted
    ? createPortal(
        <div
          className="fixed left-0 top-0 z-[2147483647] flex h-[100dvh] w-screen items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onMouseDown={cancelFlow}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-gray-700 p-8 shadow-2xl"
            style={{ backgroundColor: 'var(--bg)' }}
            onMouseDown={e => e.stopPropagation()}
          >
            {status.type === 'loading' && (
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="size-8 rounded-full border-2 border-gray-200 border-t-gray-700 dark:border-gray-700 dark:border-t-gray-300 animate-spin" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Connecting to GitHub…</p>
              </div>
            )}

            {status.type === 'error' && (
              <div className="flex flex-col items-center gap-5 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10 text-red-500">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                    <circle cx="11" cy="11" r="9.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M11 7v5M11 15v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Connection failed</p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{status.message}</p>
                </div>
                <div className="flex w-full gap-3">
                  <button
                    onClick={cancelFlow}
                    className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 py-2.5 text-sm text-gray-600 dark:text-gray-400 transition-colors hover:bg-gray-50 dark:hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={startDeviceFlow}
                    className="flex-1 rounded-xl bg-gray-900 dark:bg-gray-100 py-2.5 text-sm font-medium text-white dark:text-gray-900 transition-opacity hover:opacity-80"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}

            {status.type === 'pending' && (
              <div className="flex flex-col items-center gap-6 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                  {GH_ICON}
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Connect GitHub
                  </h2>
                  <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                    Open GitHub and enter the code below to authorize access.
                  </p>
                </div>

                <div
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 px-5 py-4"
                  style={{ backgroundColor: 'var(--bg-2)' }}
                >
                  <p className="mb-2 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    Your code
                  </p>
                  <p className="text-3xl font-bold font-mono tracking-[0.25em] text-gray-900 dark:text-gray-100">
                    {status.userCode}
                  </p>
                  <button
                    onClick={() => copyCode(status.userCode)}
                    className="mt-3 flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  >
                    {copied
                      ? (
                          <>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Copied!
                          </>
                        )
                      : (
                          <>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <rect x="4" y="1" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
                              <path d="M1 4v6a1 1 0 001 1h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                            </svg>
                            Copy code
                          </>
                        )}
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                  <div className="size-2.5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                  Waiting for authorization…
                </div>

                <div className="flex w-full flex-col gap-2.5">
                  <a
                    href={status.verificationUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 dark:bg-gray-100 px-5 py-3 text-sm font-medium text-white dark:text-gray-900 transition-opacity hover:opacity-80"
                  >
                    Open GitHub
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 10L10 2M10 2H5M10 2v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                  <button
                    onClick={cancelFlow}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 py-2.5 text-sm text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-50 dark:hover:bg-white/5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {/* ── Trigger / connected state ── */}
      {status.type === 'connected'
        ? (
            <div className="flex items-center gap-1.5">
              {/* Mobile: avatar + disconnect icon only */}
              <div className="flex items-center gap-1 sm:hidden">
                {status.user.avatar_url
                  ? <img src={status.user.avatar_url} alt={status.user.login} className="size-7 rounded-full ring-1 ring-black/10 dark:ring-white/10" />
                  : <div className="flex size-7 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">{GH_ICON}</div>}
                <button
                  onClick={disconnect}
                  title="Disconnect GitHub"
                  className="flex size-6 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              {/* Desktop: avatar + name + disconnect */}
              <div className="hidden sm:flex items-center gap-2 px-1">
                {status.user.avatar_url
                  ? <img src={status.user.avatar_url} alt={status.user.login} className="size-6 rounded-full ring-1 ring-black/10 dark:ring-white/10" />
                  : <div className="flex size-6 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">{GH_ICON}</div>}
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-gray-800 dark:text-gray-200">{status.user.name ?? status.user.login}</p>
                  <p className="truncate text-[10px] text-gray-400 dark:text-gray-500">@{status.user.login}</p>
                </div>
                <button
                  onClick={disconnect}
                  title="Disconnect GitHub"
                  className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
          )
        : (
            <>
              {/* Mobile: icon-only */}
              <button
                onClick={startDeviceFlow}
                disabled={status.type === 'loading' || status.type === 'checking'}
                title="Connect GitHub"
                className="flex sm:hidden size-8 items-center justify-center rounded-full text-gray-500 dark:text-gray-400 transition-colors hover:bg-black/6 dark:hover:bg-white/8 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-50"
              >
                {GH_ICON}
              </button>
              {/* Desktop: full button */}
              <button
                onClick={startDeviceFlow}
                disabled={status.type === 'loading' || status.type === 'checking'}
                className="hidden sm:flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 transition-colors hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-50"
                style={{ backgroundColor: 'var(--bg-card)' }}
              >
                {GH_ICON}
                Connect GitHub
              </button>
            </>
          )}

      {overlay}
    </>
  );
}
