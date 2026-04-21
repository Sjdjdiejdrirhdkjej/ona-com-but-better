'use client';

import { useEffect, useState } from 'react';
import { signOut } from '@/libs/auth-client';

type ApiKeyRecord = {
  id: string;
  name: string;
  keyPrefix: string;
  scope: 'read_only' | 'task_running';
  requestCount: number;
  rateLimitPerHour: number;
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

export function CreditsTopup() {
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [toppingUp, setToppingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [addedAmount, setAddedAmount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/credits/balance')
      .then(res => (res.ok ? res.json() : null))
      .then((data: { credits?: number } | null) => {
        if (cancelled) return;
        if (data && typeof data.credits === 'number') {
          setCredits(data.credits);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    function handleUpdate(event: Event) {
      const detail = (event as CustomEvent<{ credits: number }>).detail;
      if (detail && typeof detail.credits === 'number') {
        setCredits(detail.credits);
      }
    }

    window.addEventListener('credits-updated', handleUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener('credits-updated', handleUpdate);
    };
  }, []);

  async function handleTopup() {
    setToppingUp(true);
    setError(null);
    setSuccess(false);
    try {
      const response = await fetch('/api/credits/topup', { method: 'POST' });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? 'Could not top up credits.');
      }
      const data = await response.json() as { credits: number; added: number };
      setCredits(data.credits);
      setAddedAmount(data.added);
      setSuccess(true);
      // Dispatch event so CreditsChip in the header updates too
      window.dispatchEvent(new CustomEvent('credits-updated', { detail: { credits: data.credits } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not top up credits.');
    } finally {
      setToppingUp(false);
    }
  }

  const depleted = credits !== null && credits <= 0;
  const formattedBalance = credits !== null ? new Intl.NumberFormat().format(credits) : '—';

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Credit balance</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Credits power your AI conversations. Top up to keep the agent running.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 ${
            depleted
              ? 'border-red-400/40 bg-red-500/10'
              : 'border-black/8 dark:border-white/10'
          }`}
          style={{ backgroundColor: depleted ? undefined : 'var(--bg)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={depleted ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'}>
            <path d="M13 2 L3 14 H12 L11 22 L21 10 H12 L13 2 Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="currentColor" fillOpacity="0.18" />
          </svg>
          <span className={`text-lg font-semibold tabular-nums ${
            depleted
              ? 'text-red-700 dark:text-red-300'
              : 'text-gray-900 dark:text-gray-100'
          }`}>
            {loading ? '…' : formattedBalance}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">credits</span>
        </div>
      </div>

      {success && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-50 p-3 dark:bg-emerald-500/10">
          <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
            {new Intl.NumberFormat().format(addedAmount)} credits added successfully!
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleTopup}
        disabled={toppingUp}
        className="min-h-10 w-full rounded-xl bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
      >
        {toppingUp ? 'Adding credits…' : 'Top up 1,000 credits'}
      </button>
    </div>
  );
}

export function ApiKeysPanel() {
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [name, setName] = useState('Default key');
  const [scope, setScope] = useState<'read_only' | 'task_running'>('task_running');
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
        body: JSON.stringify({ name, scope }),
      });
      if (!response.ok) {
        throw new Error('Could not create API key.');
      }
      const data = await response.json() as { apiKey: string; record: ApiKeyRecord };
      setNewKey(data.apiKey);
      setApiKeys(keys => [data.record, ...keys]);
      setName('Default key');
      setScope('task_running');
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
          Create an API key and send it as a Bearer token in the Authorization header. Each key is scoped and limited to 60 requests per hour.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          className="min-h-10 w-full rounded-xl border border-black/8 bg-transparent px-3 text-sm text-gray-900 outline-none transition focus:border-gray-500 dark:border-white/10 dark:text-gray-100"
          placeholder="Key name"
        />

        <div className="grid gap-2 sm:grid-cols-2">
          {([
            {
              value: 'task_running',
              label: 'Task-running',
              description: 'Can run the agent, create and manage conversations, and read results. Use this for automation scripts.',
              capabilities: ['Start agent tasks', 'Create conversations', 'Read results & job events'],
            },
            {
              value: 'read_only',
              label: 'Read-only',
              description: 'Can only read existing data. Cannot trigger the agent or create anything new.',
              capabilities: ['List conversations', 'Poll job events'],
            },
          ] as const).map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => setScope(option.value)}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                scope === option.value
                  ? 'border-gray-900 bg-gray-900/5 dark:border-gray-100 dark:bg-gray-100/8'
                  : 'border-black/8 hover:border-gray-400 dark:border-white/10 dark:hover:border-white/30'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{option.label}</span>
                <span className={`size-4 shrink-0 rounded-full border-2 transition-colors ${
                  scope === option.value
                    ? 'border-gray-900 bg-gray-900 dark:border-gray-100 dark:bg-gray-100'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{option.description}</p>
              <ul className="mt-2 space-y-0.5">
                {option.capabilities.map(cap => (
                  <li key={cap} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0 text-gray-400 dark:text-gray-500">
                      <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {cap}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={createKey}
          disabled={saving}
          className="min-h-10 w-full rounded-xl bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
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
                      {key.keyPrefix}… · {key.scope === 'read_only' ? 'Read-only' : 'Task-running'} · {key.revokedAt ? 'Revoked' : key.lastUsedAt ? `Last used ${new Date(key.lastUsedAt).toLocaleDateString()}` : 'Never used'}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                      {key.requestCount.toLocaleString()} total requests · {key.rateLimitPerHour.toLocaleString()} requests/hour
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
