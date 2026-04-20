'use client';

import { useEffect, useState } from 'react';
import { signOut } from '@/libs/auth-client';

type ApiKeyRecord = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function DarkModeToggle() {
  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch {}
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Dark mode</p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Switch between light and dark theme</p>
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={mounted ? dark : false}
        aria-label="Toggle dark mode"
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-100 focus:ring-offset-2 ${
          mounted && dark ? 'bg-gray-900 dark:bg-gray-100' : 'bg-gray-200 dark:bg-gray-700'
        }`}
      >
        <span
          className={`pointer-events-none inline-block size-5 rounded-full bg-white dark:bg-gray-900 shadow ring-0 transition-transform duration-200 ease-in-out ${
            mounted && dark ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export function SignOutButton() {
  return (
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
  );
}

export function ApiKeysPanel() {
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [name, setName] = useState('Default key');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function loadApiKeys() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/settings/api-keys');
      if (!response.ok) {
        throw new Error('Could not load API keys.');
      }
      const data = await response.json() as { apiKeys: ApiKeyRecord[] };
      setApiKeys(data.apiKeys);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load API keys.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadApiKeys();
  }, []);

  async function createKey() {
    setSaving(true);
    setError(null);
    setCopied(false);
    try {
      const response = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        throw new Error('Could not create API key.');
      }
      const data = await response.json() as { apiKey: string; record: ApiKeyRecord };
      setNewKey(data.apiKey);
      setApiKeys(keys => [data.record, ...keys]);
      setName('Default key');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create API key.');
    } finally {
      setSaving(false);
    }
  }

  async function revokeKey(id: string) {
    setError(null);
    try {
      const response = await fetch(`/api/settings/api-keys/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Could not revoke API key.');
      }
      setApiKeys(keys => keys.map(key => key.id === id ? { ...key, revokedAt: new Date().toISOString() } : key));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke API key.');
    }
  }

  async function copyNewKey() {
    if (!newKey) {
      return;
    }
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Programmatic API access</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Create an API key and send it as a Bearer token in the Authorization header.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          className="min-h-10 flex-1 rounded-xl border border-black/8 bg-transparent px-3 text-sm text-gray-900 outline-none transition focus:border-gray-500 dark:border-white/10 dark:text-gray-100"
          placeholder="Key name"
        />
        <button
          type="button"
          onClick={createKey}
          disabled={saving}
          className="min-h-10 rounded-xl bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
        >
          {saving ? 'Creating…' : 'Create API key'}
        </button>
      </div>

      {newKey && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-50 p-3 dark:bg-emerald-500/10">
          <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">Copy this key now. It will not be shown again.</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-white px-3 py-2 text-xs text-gray-900 dark:bg-black/30 dark:text-gray-100">
              {newKey}
            </code>
            <button
              type="button"
              onClick={copyNewKey}
              className="rounded-lg border border-emerald-600/30 px-3 py-2 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="space-y-2">
        {loading
          ? <p className="text-xs text-gray-500 dark:text-gray-400">Loading API keys…</p>
          : apiKeys.length === 0
            ? <p className="text-xs text-gray-500 dark:text-gray-400">No API keys yet.</p>
            : apiKeys.map(key => (
                <div
                  key={key.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-black/8 px-3 py-2 dark:border-white/10"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{key.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {key.keyPrefix}… · {key.revokedAt ? 'Revoked' : key.lastUsedAt ? `Last used ${new Date(key.lastUsedAt).toLocaleDateString()}` : 'Never used'}
                    </p>
                  </div>
                  {!key.revokedAt && (
                    <button
                      type="button"
                      onClick={() => revokeKey(key.id)}
                      className="shrink-0 rounded-lg border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
      </div>
    </div>
  );
}
