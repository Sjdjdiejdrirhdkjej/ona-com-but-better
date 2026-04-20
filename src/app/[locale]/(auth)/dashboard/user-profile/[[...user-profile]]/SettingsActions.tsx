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

type ApiExample = {
  title: string;
  description: string;
  code: string;
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

function ApiExampleBlock({ example }: { example: ApiExample }) {
  const [copied, setCopied] = useState(false);

  async function copyExample() {
    await navigator.clipboard.writeText(example.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-black/8 dark:border-white/10">
      <div className="flex items-start justify-between gap-3 border-b border-black/8 px-3 py-2 dark:border-white/10">
        <div>
          <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{example.title}</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{example.description}</p>
        </div>
        <button
          type="button"
          onClick={copyExample}
          className="shrink-0 rounded-lg border border-black/8 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-black/5 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/8"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="max-h-72 overflow-auto bg-gray-950 p-3 text-xs leading-5 text-gray-100">
        <code>{example.code}</code>
      </pre>
    </div>
  );
}

export function ApiKeysPanel() {
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [name, setName] = useState('Default key');
  const [scope, setScope] = useState<'read_only' | 'task_running'>('task_running');
  const [baseUrl, setBaseUrl] = useState('');
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
    setBaseUrl(window.location.origin);
    loadApiKeys();
  }, []);

  const exampleBaseUrl = baseUrl || 'https://your-ona-app-url';
  const examples: ApiExample[] = [
    {
      title: 'Set your environment variables',
      description: 'Run this once in your terminal before calling the API.',
      code: `export ONA_BASE_URL="${exampleBaseUrl}"
export ONA_API_KEY="paste-your-api-key-here"`,
    },
    {
      title: 'List conversations',
      description: 'Fetch conversations owned by this API key.',
      code: `curl "$ONA_BASE_URL/api/conversations" \\
  -H "Authorization: Bearer $ONA_API_KEY"`,
    },
    {
      title: 'Create a conversation',
      description: 'Create a conversation before sending a task.',
      code: `CONVERSATION_ID="$(node -e 'console.log(crypto.randomUUID())')"

curl "$ONA_BASE_URL/api/conversations" \\
  -X POST \\
  -H "Authorization: Bearer $ONA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"id\\": \\"$CONVERSATION_ID\\",
    \\"title\\": \\"Programmatic task\\"
  }"`,
    },
    {
      title: 'Send a task to ONA',
      description: 'The chat endpoint streams server-sent events as the agent works.',
      code: `ASSISTANT_MESSAGE_ID="$(node -e 'console.log(crypto.randomUUID())')"
JOB_ID="$(node -e 'console.log(crypto.randomUUID())')"

curl -N "$ONA_BASE_URL/api/chat" \\
  -X POST \\
  -H "Authorization: Bearer $ONA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"conversationId\\": \\"$CONVERSATION_ID\\",
    \\"assistantMessageId\\": \\"$ASSISTANT_MESSAGE_ID\\",
    \\"jobId\\": \\"$JOB_ID\\",
    \\"messages\\": [
      {
        \\"role\\": \\"user\\",
        \\"content\\": \\"Review this repository and suggest the top three improvements.\\"
      }
    ]
  }"`,
    },
    {
      title: 'Poll background job events',
      description: 'Use this if the chat stream disconnects or you want to resume progress polling.',
      code: `curl "$ONA_BASE_URL/api/jobs/$JOB_ID/events?after=0" \\
  -H "Authorization: Bearer $ONA_API_KEY"`,
    },
  ];

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

      <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          className="min-h-10 flex-1 rounded-xl border border-black/8 bg-transparent px-3 text-sm text-gray-900 outline-none transition focus:border-gray-500 dark:border-white/10 dark:text-gray-100"
          placeholder="Key name"
        />
        <select
          value={scope}
          onChange={event => setScope(event.target.value as 'read_only' | 'task_running')}
          className="min-h-10 rounded-xl border border-black/8 bg-transparent px-3 text-sm text-gray-900 outline-none transition focus:border-gray-500 dark:border-white/10 dark:text-gray-100"
          aria-label="API key scope"
        >
          <option value="task_running">Task-running</option>
          <option value="read_only">Read-only</option>
        </select>
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

      <div className="space-y-3 border-t border-black/8 pt-4 dark:border-white/10">
        <div>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">API examples</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Copy these commands into a terminal after creating a task-running API key. Read-only keys can list conversations and poll job events, but cannot create conversations or start tasks.
          </p>
        </div>
        <div className="space-y-3">
          {examples.map(example => <ApiExampleBlock key={example.title} example={example} />)}
        </div>
      </div>
    </div>
  );
}
