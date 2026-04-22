'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CreditsChip } from '@/components/CreditsChip';
import { UserDropdown } from '@/components/UserDropdown';
import {
  DEFAULT_SUPER_AGENT_HEARTBEAT_MINUTES,
  DEFAULT_SUPER_AGENT_MODEL,
  DEFAULT_SUPER_AGENT_PROMPT,
} from '@/libs/SuperAgent';

const APP_NAME = 'ONA but OPEN SOURCE';

type SuperAgentConfig = {
  enabled: boolean;
  heartbeatMinutes: number;
  wakePrompt: string;
  model: string;
  nextHeartbeatAt: string | null;
  lastHeartbeatAt: string | null;
  lastRunStatus: string;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function SuperAgentPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialConversationId = searchParams.get('conversationId');

  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);

  const [config, setConfig] = useState<SuperAgentConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [heartbeat, setHeartbeat] = useState(String(DEFAULT_SUPER_AGENT_HEARTBEAT_MINUTES));
  const [prompt, setPrompt] = useState(DEFAULT_SUPER_AGENT_PROMPT);
  const [model, setModel] = useState<string>(DEFAULT_SUPER_AGENT_MODEL);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [waking, setWaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wakeSuccess, setWakeSuccess] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollGenerationRef = useRef(0);
  const activeSseFetchRef = useRef(false);
  const currentAssistantIdRef = useRef<string | null>(null);

  const applyConfig = useCallback((cfg: SuperAgentConfig) => {
    setConfig(cfg);
    setEnabled(cfg.enabled);
    setHeartbeat(String(cfg.heartbeatMinutes));
    setPrompt(cfg.wakePrompt);
    setModel(cfg.model);
  }, []);

  const refreshMessages = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/conversations/${convId}/messages`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json() as { messages?: { id: string; role: string; content: string }[] };
      const loaded = (data.messages ?? [])
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        }));

      setMessages((prev) => {
        if (prev.length === loaded.length) {
          const a = prev[prev.length - 1];
          const b = loaded[loaded.length - 1];
          if (a?.id === b?.id && a?.content === b?.content) return prev;
        }
        return loaded;
      });
    } catch {
      // ignore
    }
  }, []);

  const stopBackgroundPoll = useCallback(() => {
    pollGenerationRef.current += 1;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pollBackgroundJob = useCallback(async (convId: string, jobId: string, cursor: number, generation: number) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/events?after=${cursor}`, { cache: 'no-store' });
      if (generation !== pollGenerationRef.current) return;
      if (res.status === 404) {
        stopBackgroundPoll();
        setSending(false);
        return;
      }
      if (!res.ok) {
        pollTimerRef.current = setTimeout(() => {
          void pollBackgroundJob(convId, jobId, cursor, generation);
        }, 1500);
        return;
      }

      const payload = await res.json() as {
        events?: Array<{ id: number; type: string; data: Record<string, unknown> }>;
        done?: boolean;
      };
      const events = payload.events ?? [];
      let nextCursor = cursor;
      for (const event of events) {
        nextCursor = Math.max(nextCursor, event.id);
        if (event.type === 'content' && !activeSseFetchRef.current) {
          const text = typeof event.data?.text === 'string' ? event.data.text : '';
          if (text) {
            const targetId = currentAssistantIdRef.current;
            if (targetId) {
              setMessages(prev => prev.map(m =>
                m.id === targetId ? { ...m, content: m.content + text } : m,
              ));
            }
          }
        } else if (event.type === 'error') {
          const message = typeof event.data?.message === 'string' ? event.data.message : null;
          if (message) setError(message);
        }
      }

      if (payload.done) {
        stopBackgroundPoll();
        setSending(false);
        void refreshMessages(convId);
        return;
      }

      pollTimerRef.current = setTimeout(() => {
        void pollBackgroundJob(convId, jobId, nextCursor, generation);
      }, 1500);
    } catch {
      if (generation !== pollGenerationRef.current) return;
      pollTimerRef.current = setTimeout(() => {
        void pollBackgroundJob(convId, jobId, cursor, generation);
      }, 1500);
    }
  }, [refreshMessages, stopBackgroundPoll]);

  const scheduleBackgroundPoll = useCallback((convId: string, jobId: string) => {
    stopBackgroundPoll();
    const generation = pollGenerationRef.current;
    pollTimerRef.current = setTimeout(() => {
      void pollBackgroundJob(convId, jobId, 0, generation);
    }, 0);
  }, [pollBackgroundJob, stopBackgroundPoll]);

  // Load conversation messages + config when conversationId changes
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    (async () => {
      setLoadingConversation(true);
      try {
        const [msgRes, cfgRes] = await Promise.all([
          fetch(`/api/conversations/${conversationId}/messages`),
          fetch(`/api/conversations/${conversationId}/super-agent`),
        ]);
        if (!cancelled && msgRes.status === 404) {
          // Stale conversation id in the URL (e.g. created by a failed POST
          // earlier). Drop it so the next message starts a fresh task.
          setConversationId(null);
          router.replace('/app/super-agent');
          setMessages([]);
        } else if (!cancelled && msgRes.ok) {
          const data = await msgRes.json() as { messages?: { id: string; role: string; content: string }[] };
          const loaded = (data.messages ?? [])
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            }));
          setMessages(loaded);
        }
        if (!cancelled && cfgRes.ok) {
          const data = await cfgRes.json() as SuperAgentConfig;
          applyConfig(data);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingConversation(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, applyConfig]);

  // Background runs (heartbeats, "wake now", etc.) can append messages without an active stream.
  // Poll so new assistant messages show up without a manual refresh.
  useEffect(() => {
    if (!conversationId) return;
    const convId = conversationId;
    let stopped = false;
    const interval = setInterval(() => {
      if (stopped) return;
      if (sending) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      void refreshMessages(convId);
    }, 2000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [conversationId, sending, refreshMessages]);

  useEffect(() => () => {
    stopBackgroundPoll();
  }, [stopBackgroundPoll]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  // Auto-resize textarea
  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  async function ensureConversation(title: string): Promise<string> {
    if (conversationId) return conversationId;
    const id = createId();
    try {
      await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title }),
      });
    } catch {
      // ignore — fall through, server will reject downstream if needed
    }
    setConversationId(id);
    router.replace(`/app/super-agent?conversationId=${id}`);
    return id;
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    setSending(true);

    const convId = await ensureConversation(text.slice(0, 80));

    const userMsg: Message = { id: createId(), role: 'user', content: text };
    const assistantId = createId();
    const jobId = createId();
    currentAssistantIdRef.current = assistantId;
    setMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '' }]);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // The /api/super-agent/chat endpoint persists the user message itself
    // (so it survives if the SSE connection drops mid-run), no client-side
    // POST is needed here.

    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
    const abortController = new AbortController();
    abortRef.current = abortController;

    let currentAssistantId = assistantId;
    void history;
    scheduleBackgroundPoll(convId, jobId);
    let sseDeliveredContent = false;
    let keepBackgroundJob = false;
    let sseActivityTimeout: ReturnType<typeof setTimeout> | null = null;

    try {
      activeSseFetchRef.current = true;
      sseActivityTimeout = setTimeout(() => {
        activeSseFetchRef.current = false;
        if (!sseDeliveredContent) {
          abortController.abort();
        }
      }, 3000);

      const res = await fetch('/api/super-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: convId,
          message: text,
          assistantMessageId: assistantId,
          jobId,
        }),
        signal: abortController.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`API error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data) as {
              delta?: string;
              type?: string;
              error?: boolean;
              message?: string;
              tool?: string;
              messageId?: string;
              jobId?: string;
            };
            if (typeof json.delta === 'string' && json.delta) {
              sseDeliveredContent = true;
              const delta = json.delta;
              const targetId = currentAssistantId;
              setMessages(prev => prev.map(m =>
                m.id === targetId ? { ...m, content: m.content + delta } : m,
              ));
            } else if (json.type === 'assistant_msg_id' && typeof json.messageId === 'string') {
              currentAssistantId = json.messageId;
              currentAssistantIdRef.current = json.messageId;
            } else if (json.type === 'job_id' && typeof json.jobId === 'string') {
              scheduleBackgroundPoll(convId, json.jobId);
            } else if (json.type === 'error' && json.message) {
              setError(json.message);
            }
          } catch {
            // ignore malformed events
          }
        }
      }

      // Refresh super-agent config so status (next run, etc.) reflects the new conversation
      try {
        const cfgRes = await fetch(`/api/conversations/${convId}/super-agent`);
        if (cfgRes.ok) {
          applyConfig(await cfgRes.json() as SuperAgentConfig);
        }
      } catch {}
      if (sseActivityTimeout) clearTimeout(sseActivityTimeout);
      if (sseDeliveredContent) {
        stopBackgroundPoll();
        setSending(false);
      } else {
        keepBackgroundJob = true;
      }
      activeSseFetchRef.current = false;
      if (!keepBackgroundJob) {
        void refreshMessages(convId);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        keepBackgroundJob = true;
      } else {
        setError((err as Error).message ?? 'Something went wrong while contacting the agent.');
      }
    } finally {
      if (sseActivityTimeout) clearTimeout(sseActivityTimeout);
      activeSseFetchRef.current = false;
      abortRef.current = null;
      // Polling owns completion when SSE is buffered/aborted.
    }
  }

  function stopGeneration() {
    abortRef.current?.abort();
    abortRef.current = null;
    stopBackgroundPoll();
    activeSseFetchRef.current = false;
    setSending(false);
  }

  async function handleSave() {
    if (!conversationId) {
      setError('Send your first message before saving heartbeat settings.');
      return;
    }
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
    if (!conversationId) {
      setError('Send your first message before waking the agent.');
      return;
    }
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
      setTimeout(() => setWakeSuccess(false), 2500);
      // Reload messages so the heartbeat-injected user message and assistant response show up
      try {
        const msgRes = await fetch(`/api/conversations/${conversationId}/messages`);
        if (msgRes.ok) {
          const data = await msgRes.json() as { messages?: { id: string; role: string; content: string }[] };
          const loaded = (data.messages ?? [])
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            }));
          setMessages(loaded);
        }
      } catch {}
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

  const canConfigure = !!conversationId;
  const showEmptyState = !loadingConversation && messages.length === 0;

  return (
    <div
      className="flex min-h-[100dvh] flex-col text-gray-950 dark:text-gray-50"
      style={{ backgroundColor: 'var(--bg)' } as React.CSSProperties}
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

      {/* Sub-header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/6 px-3 py-2 dark:border-white/8 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`size-2 shrink-0 rounded-full ${
              config?.enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          />
          <h1 className="truncate text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Super agent
          </h1>
          <span className="hidden truncate text-[11px] text-gray-400 dark:text-gray-500 sm:inline">
            Chat with the agent — schedule wake-ups to keep it working autonomously.
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(o => !o)}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-black/8 bg-white/80 px-3 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:border-black/20 hover:text-gray-900 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:border-white/20 dark:hover:text-gray-100"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="1.6" stroke="currentColor" strokeWidth="1.2" />
            <path d="M6 1.5v1.4M6 9.1v1.4M10.5 6H9.1M2.9 6H1.5M9.18 2.82l-.99.99M3.81 8.19l-.99.99M9.18 9.18l-.99-.99M3.81 3.81l-.99-.99" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          {settingsOpen ? 'Hide schedule' : 'Wake-up schedule'}
        </button>
      </div>

      {/* Body: chat (left) + settings drawer (right) */}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-6 sm:px-6 sm:py-8">
            <div className="mx-auto max-w-3xl">
              {loadingConversation && (
                <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="animate-spin">
                    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.25" />
                    <path d="M7 1.5A5.5 5.5 0 0112.5 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  Loading conversation…
                </div>
              )}

              {showEmptyState && (
                <div className="mx-auto mt-6 max-w-xl text-center">
                  <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full bg-gray-950 text-white dark:bg-gray-100 dark:text-gray-950">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <circle cx="8" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </div>
                  <h2 className="mb-1.5 text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                    Start a conversation with your super agent
                  </h2>
                  <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                    Send a message to kick off a task. Then open
                    {' '}
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(true)}
                      className="font-medium text-gray-700 underline-offset-2 hover:underline dark:text-gray-200"
                    >
                      Wake-up schedule
                    </button>
                    {' '}
                    to make the agent loop on a heartbeat — or trigger
                    {' '}
                    <strong className="font-medium text-gray-700 dark:text-gray-300">Wake Now</strong>
                    {' '}
                    to run it instantly.
                  </p>
                </div>
              )}

              <div className="space-y-5">
                {messages.map(msg => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
                {sending && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1]?.content && (
                  <TypingIndicator />
                )}
                <div ref={bottomRef} />
              </div>

              {error && (
                <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800/50 dark:bg-red-950/30">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="mt-0.5 shrink-0 text-red-500">
                    <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M7 4.5v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Composer */}
          <div
            className="shrink-0 border-t border-black/6 px-3 pt-3 dark:border-white/10 sm:px-6 sm:pt-4"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="relative mx-auto max-w-3xl">
              {/* Status row */}
              {config && (
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 rounded-full border border-black/8 bg-white/80 px-2.5 py-1 text-[11px] text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
                    <span className={`size-1.5 rounded-full ${config.enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    {config.enabled
                      ? config.nextHeartbeatAt
                          ? `Next wake: ${new Date(config.nextHeartbeatAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : 'Heartbeat enabled'
                      : 'Heartbeat off'}
                  </span>
                </div>
              )}

              <div
                className="flex items-end gap-2 rounded-[1.5rem] border border-black/10 px-3 py-2 shadow-sm transition-shadow focus-within:border-black/20 focus-within:shadow-md dark:border-white/10 dark:focus-within:border-white/20 sm:py-2.5"
                style={{ backgroundColor: 'var(--bg-input)' }}
              >
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={autoResize}
                  onKeyDown={handleKey}
                  placeholder="Send a message to your super agent…"
                  className="flex-1 resize-none bg-transparent py-2.5 text-base text-gray-900 outline-none placeholder-gray-400 dark:text-gray-100 dark:placeholder-gray-500 sm:py-3"
                  style={{ maxHeight: '180px' }}
                />
                {sending
                  ? (
                      <button
                        onClick={stopGeneration}
                        aria-label="Stop"
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gray-950 text-white transition-opacity hover:opacity-80 active:opacity-70"
                      >
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" />
                        </svg>
                      </button>
                    )
                  : (
                      <button
                        onClick={() => void send()}
                        disabled={!input.trim()}
                        aria-label="Send"
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gray-950 text-white transition-opacity hover:opacity-80 disabled:opacity-25 active:opacity-70"
                      >
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                          <path d="M7 12V2M7 2L3 6M7 2L11 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )}
              </div>
              <p className="mt-2 hidden text-center text-[11px] text-gray-400 dark:text-gray-500 sm:block">
                Enter to send · Shift+Enter for new line
              </p>
            </div>
          </div>
        </main>

        {/* Settings drawer */}
        {settingsOpen && (
          <aside
            className="hidden w-[360px] shrink-0 overflow-y-auto border-l border-black/6 px-5 py-6 dark:border-white/8 lg:block"
            style={{ backgroundColor: 'var(--bg-card)' }}
          >
            <SettingsPanel
              canConfigure={canConfigure}
              enabled={enabled}
              setEnabled={setEnabled}
              heartbeat={heartbeat}
              setHeartbeat={setHeartbeat}
              prompt={prompt}
              setPrompt={setPrompt}
              config={config}
              statusColor={statusColor}
              saving={saving}
              waking={waking}
              wakeSuccess={wakeSuccess}
              saveSuccess={saveSuccess}
              onSave={handleSave}
              onWake={handleWakeNow}
            />
          </aside>
        )}
      </div>

      {/* Mobile settings sheet */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/40 lg:hidden"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl px-5 py-6"
            style={{ backgroundColor: 'var(--bg-card)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-700" />
            <SettingsPanel
              canConfigure={canConfigure}
              enabled={enabled}
              setEnabled={setEnabled}
              heartbeat={heartbeat}
              setHeartbeat={setHeartbeat}
              prompt={prompt}
              setPrompt={setPrompt}
              config={config}
              statusColor={statusColor}
              saving={saving}
              waking={waking}
              wakeSuccess={wakeSuccess}
              saveSuccess={saveSuccess}
              onSave={handleSave}
              onWake={handleWakeNow}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-gray-950 text-white dark:bg-gray-100 dark:text-gray-950'
            : 'border border-black/6 text-gray-900 dark:border-white/10 dark:text-gray-100'
        }`}
        style={isUser ? undefined : { backgroundColor: 'var(--bg-card)' }}
      >
        {msg.content || <span className="opacity-50">…</span>}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div
        className="flex items-center gap-1 rounded-2xl border border-black/6 px-4 py-3 dark:border-white/10"
        style={{ backgroundColor: 'var(--bg-card)' }}
      >
        <span className="size-1.5 animate-pulse rounded-full bg-gray-400 [animation-delay:-0.3s] dark:bg-gray-500" />
        <span className="size-1.5 animate-pulse rounded-full bg-gray-400 [animation-delay:-0.15s] dark:bg-gray-500" />
        <span className="size-1.5 animate-pulse rounded-full bg-gray-400 dark:bg-gray-500" />
      </div>
    </div>
  );
}

type SettingsPanelProps = {
  canConfigure: boolean;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  heartbeat: string;
  setHeartbeat: (v: string) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  config: SuperAgentConfig | null;
  statusColor: (status: string) => string;
  saving: boolean;
  waking: boolean;
  wakeSuccess: boolean;
  saveSuccess: boolean;
  onSave: () => void;
  onWake: () => void;
};

function SettingsPanel(props: SettingsPanelProps) {
  const {
    canConfigure, enabled, setEnabled, heartbeat, setHeartbeat, prompt, setPrompt,
    config, statusColor, saving, waking, wakeSuccess, saveSuccess,
    onSave, onWake,
  } = props;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-1 text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          Wake-up schedule
        </h2>
        <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
          Loop the agent on a heartbeat to keep it working in the background, or wake it instantly with one click.
        </p>
      </div>

      {!canConfigure && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
          Send a message first to start the conversation, then schedule wake-ups here.
        </div>
      )}

      {wakeSuccess && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          Super agent woke up — working in the background.
        </div>
      )}

      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          Settings saved.
        </div>
      )}

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-black/8 px-3 py-2.5 dark:border-white/10">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-900 dark:text-gray-100">Enable heartbeat</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
            Wake this conversation automatically on a schedule.
          </p>
        </div>
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => setEnabled(e.target.checked)}
          disabled={!canConfigure}
          className="size-4"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
          Heartbeat interval (minutes)
        </span>
        <input
          type="number"
          min={1}
          max={1440}
          value={heartbeat}
          onChange={e => setHeartbeat(e.target.value)}
          disabled={!canConfigure}
          className="w-full rounded-2xl border border-black/8 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-black/30 disabled:opacity-50 dark:border-white/10 dark:text-gray-100 dark:focus:border-white/30"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
          Wake prompt
        </span>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          disabled={!canConfigure}
          rows={5}
          className="w-full resize-none rounded-2xl border border-black/8 bg-transparent px-3 py-2 text-sm leading-relaxed text-gray-900 outline-none transition-colors focus:border-black/30 disabled:opacity-50 dark:border-white/10 dark:text-gray-100 dark:focus:border-white/30"
        />
      </label>

      <div className="rounded-2xl border border-black/8 px-3 py-2.5 text-[11px] dark:border-white/10">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Status</p>
        <div className="space-y-1 text-gray-600 dark:text-gray-300">
          <p>
            Status:
            {' '}
            <span className={`font-medium ${statusColor(config?.lastRunStatus ?? 'idle')}`}>
              {config?.lastRunStatus ?? 'idle'}
            </span>
          </p>
          <p>
            Next run:
            {' '}
            {config?.nextHeartbeatAt
              ? new Date(config.nextHeartbeatAt).toLocaleString()
              : <span className="text-gray-400 dark:text-gray-500">Not scheduled</span>}
          </p>
          <p>
            Last run:
            {' '}
            {config?.lastHeartbeatAt
              ? new Date(config.lastHeartbeatAt).toLocaleString()
              : <span className="text-gray-400 dark:text-gray-500">Never</span>}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={onWake}
          disabled={!canConfigure || waking}
          className="flex w-full items-center justify-center gap-1.5 rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-black/30 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:border-white/30 dark:hover:text-gray-100"
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
          onClick={onSave}
          disabled={!canConfigure || saving}
          className="w-full rounded-full bg-gray-950 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-100 dark:text-gray-950"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
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
