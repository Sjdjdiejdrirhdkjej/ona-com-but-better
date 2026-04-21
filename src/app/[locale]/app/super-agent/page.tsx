'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CreditsChip } from '@/components/CreditsChip';
import { UserDropdown } from '@/components/UserDropdown';
import {
  DEFAULT_SUPER_AGENT_HEARTBEAT_MINUTES,
  DEFAULT_SUPER_AGENT_MODEL,
  DEFAULT_SUPER_AGENT_PROMPT,
} from '@/libs/SuperAgent';

const APP_NAME = 'ONA but OPEN SOURCE';

const AUTONOMY_OPTIONS = [
  { key: 'ona-max', label: 'Hands on experience', description: 'Kimi K2.5 · fast, collaborative' },
  { key: 'ona-hands-off', label: 'Hands off experience', description: 'Qwen3 Coder 480B · agentic, 262K ctx' },
] as const;

type SuperAgentConfig = {
  enabled: boolean;
  heartbeatMinutes: number;
  wakePrompt: string;
  model: string;
  nextHeartbeatAt: string | null;
  lastHeartbeatAt: string | null;
  lastRunStatus: string;
};

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

function SuperAgentPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const conversationId = searchParams.get('conversationId');

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [config, setConfig] = useState<SuperAgentConfig | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [heartbeat, setHeartbeat] = useState(String(DEFAULT_SUPER_AGENT_HEARTBEAT_MINUTES));
  const [prompt, setPrompt] = useState(DEFAULT_SUPER_AGENT_PROMPT);
  const [model, setModel] = useState<string>(DEFAULT_SUPER_AGENT_MODEL);

  const [saving, setSaving] = useState(false);
  const [waking, setWaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wakeSuccess, setWakeSuccess] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const applyConfig = useCallback((cfg: SuperAgentConfig) => {
    setConfig(cfg);
    setEnabled(cfg.enabled);
    setHeartbeat(String(cfg.heartbeatMinutes));
    setPrompt(cfg.wakePrompt);
    setModel(cfg.model);
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/conversations/${conversationId}/super-agent`);
        if (!res.ok) {
          setNotFound(true);
        } else {
          const data = await res.json() as SuperAgentConfig;
          applyConfig(data);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [conversationId, applyConfig]);

  async function handleSave() {
    if (!conversationId) return;
    const heartbeatMinutes = Math.max(1, Number.parseInt(heartbeat, 10) || DEFAULT_SUPER_AGENT_HEARTBEAT_MINUTES);
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/super-agent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          heartbeatMinutes,
          wakePrompt: prompt.trim() || DEFAULT_SUPER_AGENT_PROMPT,
          model,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const updated = await res.json() as SuperAgentConfig;
      applyConfig(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch {
      setError('Could not save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleWakeNow() {
    if (!conversationId) return;
    setError(null);
    setWakeSuccess(false);
    setWaking(true);
    try {
      const res = await fetch('/api/super-agent/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, force: true }),
      });
      if (!res.ok) throw new Error('Failed');
      setWakeSuccess(true);
      setTimeout(() => {
        router.push(`/app?conversationId=${conversationId}`);
      }, 1400);
    } catch {
      setError('Could not wake the super agent. Please try again.');
    } finally {
      setWaking(false);
    }
  }

  const statusColor = (status: string) =>
    status === 'error'
      ? 'text-red-600 dark:text-red-400'
      : status === 'running'
        ? 'text-indigo-600 dark:text-indigo-400'
        : status === 'success'
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-gray-500 dark:text-gray-400';

  return (
    <div
      className="flex min-h-[100dvh] flex-col"
      style={{ backgroundColor: 'var(--bg-base, #f9f9f8)' } as React.CSSProperties}
    >
      {/* Header */}
      <header
        className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-black/6 px-2.5 text-xs dark:border-white/8 sm:h-10 sm:px-5"
        style={{ backgroundColor: 'var(--bg-header)', backdropFilter: 'blur(14px)' }}
      >
        <Link
          href="/"
          className="flex min-w-0 shrink-0 basis-0 grow items-center gap-1.5 truncate font-semibold tracking-tight text-gray-950 dark:text-gray-50 sm:mr-2 sm:gap-2"
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-gray-950 text-[10px] text-white dark:bg-gray-100 dark:text-gray-950">O</span>
          <span className="hidden sm:inline">{APP_NAME}</span>
          <span className="sm:hidden">ONA</span>
        </Link>

        <nav className="hidden shrink-0 items-center gap-6 text-[11px] text-gray-500 dark:text-gray-400 md:flex">
          <Link href="/app" className="transition-colors hover:text-gray-950 dark:hover:text-gray-100">Tasks</Link>
          <Link href="/" className="transition-colors hover:text-gray-950 dark:hover:text-gray-100">Home</Link>
        </nav>

        <div className="flex min-w-0 shrink-0 basis-0 grow items-center justify-end gap-0.5 sm:gap-2">
          <span className="hidden sm:contents">
            <ThemeToggle />
            <CreditsChip />
          </span>
          <UserDropdown />
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-16">
        {/* Back link */}
        <Link
          href={conversationId ? `/app?conversationId=${conversationId}` : '/app'}
          className="mb-8 inline-flex items-center gap-1.5 text-xs text-gray-400 transition-colors hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to task
        </Link>

        <div className="mb-8">
          <div className="mb-1.5 flex items-center gap-2.5">
            <span
              className={`size-2 shrink-0 rounded-full ${
                config?.enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            />
            <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">Super agent</h1>
          </div>
          <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            Wakes this conversation autonomously on a schedule to continue working. Use{' '}
            <strong className="font-medium text-gray-700 dark:text-gray-300">Wake Now</strong> to trigger it
            instantly, or enable the heartbeat and point a cron job at your deployment.
          </p>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="animate-spin">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.25" />
              <path d="M7 1.5A5.5 5.5 0 0112.5 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Loading configuration…
          </div>
        )}

        {!loading && notFound && (
          <div
            className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300"
          >
            {conversationId
              ? 'Send the first task to save this conversation before enabling the super agent.'
              : 'No conversation selected. Go back and open a task first.'}
          </div>
        )}

        {!loading && !notFound && (
          <div className="space-y-4">
            {/* Alerts */}
            {error && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800/50 dark:bg-red-950/30">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="mt-0.5 shrink-0 text-red-500">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M7 4.5v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            {wakeSuccess && (
              <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/50 dark:bg-emerald-950/30">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-emerald-500">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M4.5 7l2 2 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">Super agent woke up — working in the background. Redirecting…</p>
              </div>
            )}

            {saveSuccess && (
              <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/50 dark:bg-emerald-950/30">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-emerald-500">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M4.5 7l2 2 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">Settings saved.</p>
              </div>
            )}

            {/* Enable heartbeat */}
            <label
              className="flex cursor-pointer items-center justify-between rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-800"
              style={{ backgroundColor: 'var(--bg-card)' }}
            >
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Enable heartbeat</p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Let a cron job wake this conversation automatically on a schedule.
                </p>
              </div>
              <input
                type="checkbox"
                checked={enabled}
                onChange={e => { setEnabled(e.target.checked); setError(null); }}
                className="size-4"
              />
            </label>

            {/* Heartbeat endpoint */}
            {enabled && (
              <div
                className="rounded-2xl border border-gray-200 bg-gray-50/50 px-4 py-3 dark:border-gray-800 dark:bg-white/3"
                style={{ backgroundColor: 'var(--bg-card)' }}
              >
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Heartbeat endpoint</p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-mono text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                    POST /api/super-agent/heartbeat
                  </code>
                  <button
                    type="button"
                    onClick={async () => {
                      const url = `${window.location.origin}/api/super-agent/heartbeat`;
                      const ok = await copyTextToClipboard(url);
                      if (ok) {
                        setUrlCopied(true);
                        setTimeout(() => setUrlCopied(false), 2000);
                      }
                    }}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-100"
                  >
                    {urlCopied
                      ? (
                          <>
                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                              <path d="M1.5 5.5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Copied
                          </>
                        )
                      : (
                          <>
                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                              <rect x="3.5" y="1" width="6.5" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
                              <path d="M1 3.5v6a1 1 0 001 1h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                            </svg>
                            Copy
                          </>
                        )}
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">
                  Authenticate with header{' '}
                  <code className="rounded bg-gray-100 px-1 py-px font-mono dark:bg-gray-800">
                    x-ona-heartbeat-secret: &lt;your secret&gt;
                  </code>
                  . Set the{' '}
                  <code className="rounded bg-gray-100 px-1 py-px font-mono dark:bg-gray-800">
                    SUPER_AGENT_HEARTBEAT_SECRET
                  </code>{' '}
                  env var to configure the secret.
                </p>
              </div>
            )}

            {/* Interval + Model */}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                  Heartbeat interval (minutes)
                </span>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={heartbeat}
                  onChange={e => setHeartbeat(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-gray-400 dark:border-gray-800 dark:text-gray-100 dark:focus:border-gray-600"
                  style={{ backgroundColor: 'var(--bg-card)' }}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                  Model
                </span>
                <select
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-gray-400 dark:border-gray-800 dark:text-gray-100 dark:focus:border-gray-600"
                  style={{ backgroundColor: 'var(--bg-card)' }}
                >
                  {AUTONOMY_OPTIONS.map(option => (
                    <option key={option.key} value={option.key} className="text-black">
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Wake prompt */}
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                Wake prompt
              </span>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={5}
                className="w-full resize-none rounded-2xl border border-gray-200 bg-transparent px-3 py-2 text-sm leading-relaxed text-gray-900 outline-none transition-colors focus:border-gray-400 dark:border-gray-800 dark:text-gray-100 dark:focus:border-gray-600"
                style={{ backgroundColor: 'var(--bg-card)' }}
              />
            </label>

            {/* Status card */}
            <div
              className="rounded-2xl border border-gray-200 px-4 py-3 text-xs dark:border-gray-800"
              style={{ backgroundColor: 'var(--bg-card)' }}
            >
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Status</p>
              <div className="space-y-1 text-gray-600 dark:text-gray-300">
                <p>
                  Status:{' '}
                  <span className={`font-medium ${statusColor(config?.lastRunStatus ?? 'idle')}`}>
                    {config?.lastRunStatus ?? 'idle'}
                  </span>
                </p>
                <p>
                  Next run:{' '}
                  {config?.nextHeartbeatAt
                    ? new Date(config.nextHeartbeatAt).toLocaleString()
                    : <span className="text-gray-400 dark:text-gray-500">Not scheduled</span>}
                </p>
                <p>
                  Last run:{' '}
                  {config?.lastHeartbeatAt
                    ? new Date(config.lastHeartbeatAt).toLocaleString()
                    : <span className="text-gray-400 dark:text-gray-500">Never</span>}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={handleWakeNow}
                disabled={waking || wakeSuccess}
                className="flex items-center justify-center gap-1.5 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-gray-100"
              >
                {waking
                  ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="animate-spin text-indigo-400">
                          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" strokeOpacity="0.25" />
                          <path d="M6 1.5A4.5 4.5 0 0110.5 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                        </svg>
                        Waking…
                      </>
                    )
                  : 'Wake Now'}
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-full bg-gray-950 px-6 py-2 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-100 dark:text-gray-950"
              >
                {saving ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function SuperAgentPage() {
  return (
    <Suspense>
      <SuperAgentPageInner />
    </Suspense>
  );
}
