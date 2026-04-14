'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

const SERIF = 'Georgia, "Times New Roman", serif';
const BG = '#f7f6f2';
const SIDEBAR_BG = '#edecea';

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string | ContentPart[];
  imagePreview?: string;
};

type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
};

type GitHubStatus = {
  configured: boolean;
  connected: boolean;
  user?: {
    login: string;
    avatar_url?: string;
    html_url?: string;
  };
  error?: string;
};

type DeviceAuthState = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
  status: 'waiting' | 'polling' | 'error';
  errorMsg?: string;
};

const SUGGESTIONS = [
  'Inspect my repos and suggest agent tasks',
  'Clone a repo and open a docs sync PR',
  'Review open pull requests in GitHub',
  'Find and fix CVEs in my repos',
];

function relativeTime(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function OnaAvatar() {
  return (
    <div
      className="mr-2.5 mt-1 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ background: 'linear-gradient(135deg,#7b68ee,#9370db)' }}
    >
      O
    </div>
  );
}

function AssistantMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        h1: ({ children }) => <h1 className="mb-2 mt-3 text-base font-bold first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 mt-3 text-sm font-bold first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h3>,
        ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        code: ({ children, className }) => {
          const isBlock = !!className;
          return isBlock
            ? (
                <code className={`block overflow-x-auto font-mono whitespace-pre ${className ?? ''}`}>
                  {children}
                </code>
              )
            : (
                <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-xs">{children}</code>
              );
        },
        pre: ({ children }) => <pre className="mb-2 mt-1 overflow-hidden rounded-lg">{children}</pre>,
        blockquote: ({ children }) => (
          <blockquote className="mb-2 border-l-2 border-gray-400 pl-3 italic text-gray-600">
            {children}
          </blockquote>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-70">
            {children}
          </a>
        ),
        hr: () => <hr className="my-2 border-gray-300" />,
        table: ({ children }) => (
          <div className="mb-2 overflow-x-auto">
            <table className="min-w-full text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border border-gray-300 px-2 py-1 text-left font-semibold">{children}</th>,
        td: ({ children }) => <td className="border border-gray-300 px-2 py-1">{children}</td>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <button
      onClick={handleCopy}
      aria-label={copied ? 'Copied!' : 'Copy message'}
      className="copy-btn mt-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-gray-400 opacity-0 transition-all hover:bg-black/5 hover:text-gray-600 group-hover:opacity-100"
    >
      {copied
        ? (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Copied
            </>
          )
        : (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="4" y="1" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <path d="M1 4v6a1 1 0 001 1h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Copy
            </>
          )}
    </button>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  const text = typeof msg.content === 'string'
    ? msg.content
    : (msg.content.find(p => p.type === 'text') as { type: 'text'; text: string } | undefined)?.text ?? '';

  return (
    <div className={`group flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && <OnaAvatar />}
      <div className="max-w-[85%] space-y-2 sm:max-w-[80%]">
        {msg.imagePreview && (
          <img
            src={msg.imagePreview}
            alt="Uploaded"
            className="max-h-48 w-full rounded-xl border border-gray-200 object-cover"
          />
        )}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? 'rounded-tr-sm bg-gray-900 text-white whitespace-pre-wrap'
              : 'rounded-tl-sm border border-gray-200 text-gray-800'
          }`}
          style={!isUser ? { backgroundColor: '#eceae4' } : {}}
        >
          {isUser ? text : <AssistantMarkdown text={text} />}
        </div>
        {!isUser && text && <CopyButton text={text} />}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <OnaAvatar />
      <div
        className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-gray-200 px-4 py-3"
        style={{ backgroundColor: '#eceae4' }}
      >
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-gray-400"
            style={{ animation: `ona-pulse 1s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>
    </div>
  );
}

function newConversation(): Conversation {
  return { id: crypto.randomUUID(), title: 'New task', messages: [], createdAt: Date.now() };
}

export default function AppPage() {
  const [conversations, setConversations] = useState<Conversation[]>(() => [newConversation()]);
  const [activeId, setActiveId] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(true);
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [search, setSearch] = useState('');
  const [githubStatus, setGithubStatus] = useState<GitHubStatus | null>(null);
  const [deviceAuth, setDeviceAuth] = useState<DeviceAuthState | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncedIds = useRef<Set<string>>(new Set());

  // Load conversation history from DB on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch('/api/conversations');
        if (!res.ok) return;
        const data = await res.json() as Array<{
          id: string;
          title: string;
          createdAt: string;
          messages: Array<{ id: string; role: string; content: unknown }>;
        }>;

        if (data.length > 0) {
          const loaded: Conversation[] = data.map(c => ({
            id: c.id,
            title: c.title,
            createdAt: new Date(c.createdAt).getTime(),
            messages: c.messages.map(m => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: m.content as string | ContentPart[],
            })),
          }));
          loaded.forEach(c => syncedIds.current.add(c.id));
          setConversations([newConversation(), ...loaded]);
        }
      } catch {}
      finally {
        setLoadingHistory(false);
      }
    }
    loadHistory();
  }, []);

  useEffect(() => {
    async function loadGitHubStatus() {
      try {
        const res = await fetch('/api/github/status');
        const data = await res.json() as GitHubStatus;
        setGithubStatus(data);
      } catch {
        setGithubStatus({ configured: false, connected: false });
      }
    }
    loadGitHubStatus();
  }, []);

  async function disconnectGitHub() {
    await fetch('/api/github/logout', { method: 'POST' });
    setGithubStatus(prev => ({ configured: prev?.configured ?? true, connected: false }));
  }

  function cancelDeviceAuth() {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setDeviceAuth(null);
  }

  async function startDeviceAuth() {
    try {
      const res = await fetch('/api/github/device/start', { method: 'POST' });
      const data = await res.json() as {
        device_code?: string;
        user_code?: string;
        verification_uri?: string;
        interval?: number;
        error?: string;
      };
      if (!res.ok || !data.device_code) {
        throw new Error(data.error ?? 'Failed to start device auth');
      }
      const auth: DeviceAuthState = {
        device_code: data.device_code,
        user_code: data.user_code!,
        verification_uri: data.verification_uri ?? 'https://github.com/login/device',
        interval: (data.interval ?? 5) * 1000,
        status: 'polling',
      };
      setDeviceAuth(auth);
      schedulePoll(auth);
    } catch (err) {
      setDeviceAuth({ device_code: '', user_code: '', verification_uri: '', interval: 5000, status: 'error', errorMsg: (err as Error).message });
    }
  }

  function schedulePoll(auth: DeviceAuthState) {
    pollTimerRef.current = setTimeout(() => pollDeviceAuth(auth), auth.interval);
  }

  async function pollDeviceAuth(auth: DeviceAuthState) {
    try {
      const res = await fetch('/api/github/device/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: auth.device_code }),
      });
      const data = await res.json() as {
        status: string;
        user?: GitHubStatus['user'];
        interval?: number;
        error?: string;
      };

      if (data.status === 'authorized') {
        setDeviceAuth(null);
        setGithubStatus({ configured: true, connected: true, user: data.user });
        return;
      }
      if (data.status === 'expired') {
        setDeviceAuth(prev => prev ? { ...prev, status: 'error', errorMsg: 'Code expired. Please try again.' } : null);
        return;
      }
      if (data.status === 'denied') {
        setDeviceAuth(prev => prev ? { ...prev, status: 'error', errorMsg: 'Access denied.' } : null);
        return;
      }
      if (data.status === 'error') {
        setDeviceAuth(prev => prev ? { ...prev, status: 'error', errorMsg: data.error ?? 'Unknown error' } : null);
        return;
      }
      const nextInterval = data.status === 'slow_down' ? (data.interval ?? auth.interval / 1000 + 5) * 1000 : auth.interval;
      const nextAuth = { ...auth, interval: nextInterval };
      setDeviceAuth(nextAuth);
      schedulePoll(nextAuth);
    } catch {
      schedulePoll(auth);
    }
  }

  // Detect mobile vs desktop and set sidebar default
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = (e: MediaQueryListEvent | MediaQueryList) => {
      const desktop = e.matches;
      setIsMobile(!desktop);
      setSidebarOpen(desktop);
    };
    update(mq);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (conversations.length > 0 && !activeId) {
      setActiveId(conversations[0]!.id);
    }
  }, [conversations, activeId]);

  const activeConversation = conversations.find(c => c.id === activeId);
  const messages = activeConversation?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (isMobile && sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMobile, sidebarOpen]);

  function closeSidebarOnMobile() {
    if (isMobile) setSidebarOpen(false);
  }

  function createNewChat() {
    const c = newConversation();
    setConversations(prev => [c, ...prev]);
    setActiveId(c.id);
    setInput('');
    setPendingImage(null);
    closeSidebarOnMobile();
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (syncedIds.current.has(id)) {
      try {
        await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
        syncedIds.current.delete(id);
      } catch {}
    }
    setConversations((prev) => {
      const next = prev.filter(c => c.id !== id);
      if (id === activeId) {
        if (next.length === 0) {
          const fresh = newConversation();
          setActiveId(fresh.id);
          return [fresh];
        }
        setActiveId(next[0]!.id);
      }
      return next;
    });
  }

  const send = useCallback(async (text: string, imageDataUrl?: string) => {
    const trimmed = text.trim();
    if ((!trimmed && !imageDataUrl) || loading || !activeId) return;

    const userContent: ContentPart[] = [];
    if (trimmed) userContent.push({ type: 'text', text: trimmed });
    if (imageDataUrl) userContent.push({ type: 'image_url', image_url: { url: imageDataUrl } });

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userContent.length === 1 && userContent[0]!.type === 'text' ? trimmed : userContent,
      imagePreview: imageDataUrl,
    };

    const currentConv = conversations.find(c => c.id === activeId)!;
    const isFirstMessage = currentConv.messages.length === 0;
    const title = trimmed
      ? (trimmed.length > 42 ? `${trimmed.slice(0, 42)}…` : trimmed)
      : 'Image task';

    setInput('');
    setPendingImage(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setLoading(true);

    const assistantId = crypto.randomUUID();
    const historyMessages = [...currentConv.messages, userMsg];

    setConversations(prev => prev.map(c =>
      c.id === activeId
        ? {
            ...c,
            messages: [...c.messages, userMsg, { id: assistantId, role: 'assistant' as const, content: '' }],
            title: isFirstMessage ? title : c.title,
          }
        : c,
    ));

    // Persist to DB
    const convId = activeId;
    const convTitle = isFirstMessage ? title : currentConv.title;
    if (!syncedIds.current.has(convId)) {
      try {
        await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: convId, title: convTitle }),
        });
        syncedIds.current.add(convId);
      } catch {}
    } else if (isFirstMessage) {
      try {
        await fetch(`/api/conversations/${convId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: convTitle }),
        });
      } catch {}
    }

    // Save user message
    try {
      await fetch(`/api/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: userMsg.id, role: 'user', content: userMsg.content }),
      });
    } catch {}

    let assistantText = '';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);

      const reader = res.body!.getReader();
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
          if (data === '[DONE]') break;
          try {
            const { delta } = JSON.parse(data) as { delta: string };
            if (delta) {
              assistantText += delta;
              setConversations(prev =>
                prev.map(c =>
                  c.id === activeId
                    ? {
                        ...c,
                        messages: c.messages.map(m =>
                          m.id === assistantId
                            ? { ...m, content: (typeof m.content === 'string' ? m.content : '') + delta }
                            : m,
                        ),
                      }
                    : c,
                ),
              );
            }
          } catch {}
        }
      }
    } catch (err) {
      assistantText = `Something went wrong: ${(err as Error).message}`;
      setConversations(prev =>
        prev.map(c =>
          c.id === activeId
            ? {
                ...c,
                messages: c.messages.map(m =>
                  m.id === assistantId
                    ? { ...m, content: assistantText }
                    : m,
                ),
              }
            : c,
        ),
      );
    } finally {
      setLoading(false);
    }

    // Save assistant message
    if (assistantText) {
      try {
        await fetch(`/api/conversations/${convId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: assistantId, role: 'assistant', content: assistantText }),
        });
      } catch {}
    }
  }, [activeId, conversations, loading]);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input, pendingImage ?? undefined);
    }
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPendingImage(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function handlePaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPendingImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  const isEmpty = messages.length === 0;
  const canSend = !!(input.trim() || pendingImage) && !loading;

  const sidebarContent = (
    <>
      <div className="shrink-0 px-3 pt-4 pb-2 space-y-2">
        <button
          onClick={createNewChat}
          className="flex w-full items-center gap-2 rounded-xl border border-black/8 px-3 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-black/6 active:bg-black/10"
          style={{ backgroundColor: 'rgba(255,255,255,0.5)' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          New task
        </button>
        <div className="relative">
          <svg
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          >
            <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="w-full rounded-lg border border-black/8 bg-white/60 py-1.5 pl-7 pr-3 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-gray-300 focus:bg-white transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M1 1l9 9M10 1L1 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        {loadingHistory
          ? (
              <div className="px-3 py-4 text-xs text-gray-400">Loading history…</div>
            )
          : (() => {
              const q = search.trim().toLowerCase();
              const filtered = conversations.filter((c) => {
                if (c.messages.length === 0) return false;
                if (!q) return true;
                if (c.title.toLowerCase().includes(q)) return true;
                return c.messages.some(m =>
                  (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
                    .toLowerCase()
                    .includes(q),
                );
              });
              if (filtered.length === 0) {
                return (
                  <div className="px-3 py-4 text-xs text-gray-400">
                    {q ? 'No tasks match your search.' : 'No tasks yet.'}
                  </div>
                );
              }
              return filtered.map(c => (
            <div
              key={c.id}
              className={`group relative flex w-full items-start rounded-xl px-3 py-3 text-left transition-colors ${
                c.id === activeId
                  ? 'bg-black/8 text-gray-900'
                  : 'text-gray-600 hover:bg-black/5 hover:text-gray-900 active:bg-black/8'
              }`}
            >
              <button
                onClick={() => { setActiveId(c.id); closeSidebarOnMobile(); }}
                className="min-w-0 flex-1 text-left"
                aria-label={`Switch to task: ${c.title}`}
              >
                <p className="truncate pr-6 text-sm font-medium leading-tight">{c.title}</p>
                <p className="mt-0.5 text-xs text-gray-400">{relativeTime(c.createdAt)}</p>
              </button>
              <button
                onClick={e => deleteConversation(c.id, e)}
                className="delete-btn absolute right-2 top-3 shrink-0 rounded p-1 text-gray-300 opacity-0 transition-opacity hover:text-gray-600 group-hover:opacity-100"
                aria-label="Delete task"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
              ));
            })()}
      </div>

      <div className="shrink-0 border-t border-black/8 px-3 py-3">
        <p className="text-xs text-gray-400">Powered by Kimi K2.5 on Fireworks AI</p>
      </div>
    </>
  );

  return (
    <div className="flex flex-col" style={{ backgroundColor: BG, height: '100dvh' }}>
      {/* ── Header ── */}
      <header
        className="flex h-14 shrink-0 items-center justify-between border-b border-black/8 px-4"
        style={{ backgroundColor: 'rgba(247,246,242,0.92)', backdropFilter: 'blur(14px)' }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="flex size-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-black/6 hover:text-gray-900 active:bg-black/10"
            aria-label="Toggle sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="4" width="14" height="1.4" rx="0.7" fill="currentColor" />
              <rect x="2" y="8.3" width="14" height="1.4" rx="0.7" fill="currentColor" />
              <rect x="2" y="12.6" width="14" height="1.4" rx="0.7" fill="currentColor" />
            </svg>
          </button>
          <Link href="/" className="text-base font-bold tracking-tight text-gray-950">
            ONA
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {githubStatus?.connected
            ? (
                <button
                  onClick={disconnectGitHub}
                  title={`Connected as ${githubStatus.user?.login ?? 'GitHub user'}. Click to disconnect.`}
                  className="flex items-center gap-2 rounded-lg border border-black/10 bg-white/60 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-black/6 hover:text-gray-950 active:bg-black/10"
                >
                  {githubStatus.user?.avatar_url
                    ? <img src={githubStatus.user.avatar_url} alt="" className="size-5 rounded-full" />
                    : (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M8 0C3.58 0 0 3.67 0 8.2c0 3.62 2.29 6.69 5.47 7.77.4.08.55-.18.55-.4 0-.2-.01-.86-.01-1.56-2.01.38-2.53-.5-2.69-.95-.09-.23-.48-.95-.82-1.14-.28-.16-.68-.55-.01-.56.63-.01 1.08.59 1.23.83.72 1.24 1.87.89 2.33.68.07-.53.28-.89.51-1.1-1.78-.21-3.64-.91-3.64-4.04 0-.89.31-1.62.82-2.19-.08-.21-.36-1.04.08-2.16 0 0 .67-.22 2.2.84A7.37 7.37 0 018 3.95c.68 0 1.36.09 2 .27 1.53-1.06 2.2-.84 2.2-.84.44 1.12.16 1.95.08 2.16.51.57.82 1.3.82 2.19 0 3.14-1.87 3.83-3.65 4.04.29.25.54.74.54 1.5 0 1.09-.01 1.96-.01 2.23 0 .22.15.48.55.4A8.13 8.13 0 0016 8.2C16 3.67 12.42 0 8 0z" />
                        </svg>
                      )}
                  <span className="hidden sm:inline">{githubStatus.user?.login ?? 'GitHub connected'}</span>
                </button>
              )
            : (
                <button
                  onClick={startDeviceAuth}
                  disabled={githubStatus?.configured === false}
                  title={githubStatus?.configured === false ? 'GITHUB_CLIENT_ID is not configured.' : 'Connect GitHub to let Ona inspect repos and open PRs.'}
                  className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm transition-colors bg-gray-950 text-white hover:opacity-85 active:opacity-75 disabled:pointer-events-none disabled:bg-gray-100 disabled:text-gray-400"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0C3.58 0 0 3.67 0 8.2c0 3.62 2.29 6.69 5.47 7.77.4.08.55-.18.55-.4 0-.2-.01-.86-.01-1.56-2.01.38-2.53-.5-2.69-.95-.09-.23-.48-.95-.82-1.14-.28-.16-.68-.55-.01-.56.63-.01 1.08.59 1.23.83.72 1.24 1.87.89 2.33.68.07-.53.28-.89.51-1.1-1.78-.21-3.64-.91-3.64-4.04 0-.89.31-1.62.82-2.19-.08-.21-.36-1.04.08-2.16 0 0 .67-.22 2.2.84A7.37 7.37 0 018 3.95c.68 0 1.36.09 2 .27 1.53-1.06 2.2-.84 2.2-.84.44 1.12.16 1.95.08 2.16.51.57.82 1.3.82 2.19 0 3.14-1.87 3.83-3.65 4.04.29.25.54.74.54 1.5 0 1.09-.01 1.96-.01 2.23 0 .22.15.48.55.4A8.13 8.13 0 0016 8.2C16 3.67 12.42 0 8 0z" />
                  </svg>
                  <span className="hidden sm:inline">Connect GitHub</span>
                </button>
              )}
          <button
            onClick={createNewChat}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-black/6 hover:text-gray-900 active:bg-black/10"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="hidden sm:inline">New task</span>
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="relative flex min-h-0 flex-1">

        {/* Mobile: overlay backdrop */}
        {isMobile && sidebarOpen && (
          <div
            className="absolute inset-0 z-20 bg-black/30 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar — drawer on mobile, inline on desktop */}
        {sidebarOpen && (
          <aside
            className={`flex shrink-0 flex-col overflow-hidden border-r border-black/8 ${
              isMobile
                ? 'absolute left-0 top-0 z-30 h-full w-72 shadow-xl'
                : 'relative w-64'
            }`}
            style={{ backgroundColor: SIDEBAR_BG }}
          >
            {sidebarContent}
          </aside>
        )}

        {/* ── Chat area ── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Messages / empty state */}
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
            {isEmpty
              ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <h1
                      className="mb-3 text-2xl text-gray-900 sm:text-4xl"
                      style={{ fontFamily: SERIF, fontWeight: 400 }}
                    >
                      What should Ona do?
                    </h1>
                    <p className="mb-7 max-w-xs text-sm text-gray-500 sm:max-w-sm">
                      Connect GitHub, describe a task, and a background agent can inspect repos, create a branch, commit changes, and open a pull request.
                    </p>
                    {githubStatus?.configured === false && (
                      <p className="mb-4 max-w-sm rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                        GitHub Device Auth needs GITHUB_CLIENT_ID before users can connect their repositories.
                      </p>
                    )}
                    <div className="flex flex-wrap justify-center gap-2">
                      {SUGGESTIONS.map(s => (
                        <button
                          key={s}
                          onClick={() => send(s)}
                          className="rounded-full border border-gray-300 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:border-gray-500 hover:text-gray-950 active:bg-gray-100"
                          style={{ backgroundColor: '#f7f6f2' }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              : (
                  <div className="mx-auto max-w-2xl space-y-5">
                    {messages.map(msg => (
                      <MessageBubble key={msg.id} msg={msg} />
                    ))}
                    {loading && messages.at(-1)?.role !== 'assistant' && <TypingIndicator />}
                    <div ref={bottomRef} />
                  </div>
                )}
          </div>

          {/* ── Input bar ── */}
          <div className="shrink-0 border-t border-gray-200 px-3 py-3 sm:px-6 sm:py-4">
            <div className="mx-auto max-w-2xl">
              {pendingImage && (
                <div className="mb-2 flex items-center gap-2">
                  <img src={pendingImage} alt="Pending" className="h-14 rounded-lg border border-gray-200 object-cover" />
                  <button
                    onClick={() => setPendingImage(null)}
                    className="flex size-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    aria-label="Remove image"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              )}

              <div
                className="flex items-end gap-2 rounded-2xl border border-gray-300 px-3 py-2.5 transition-shadow focus-within:border-gray-400 focus-within:shadow-sm"
                style={{ backgroundColor: '#fff' }}
              >
                {/* Image attach */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 active:bg-gray-100"
                  aria-label="Attach image"
                >
                  <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
                    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                    <circle cx="5.5" cy="6" r="1.25" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M1.5 11l3.5-3 2.5 2.5 2-2 4.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={autoResize}
                  onKeyDown={handleKey}
                  onPaste={handlePaste}
                  placeholder="Describe a task for your agent…"
                  className="flex-1 resize-none bg-transparent py-1 text-sm text-gray-900 placeholder-gray-400 outline-none"
                  style={{ maxHeight: '160px' }}
                />

                {/* Send */}
                <button
                  onClick={() => send(input, pendingImage ?? undefined)}
                  disabled={!canSend}
                  aria-label="Send"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gray-950 text-white transition-opacity hover:opacity-80 disabled:opacity-25 active:opacity-70"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 12V2M7 2L3 6M7 2L11 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              {/* Hint — desktop only */}
              <p className="mt-1.5 hidden text-center text-xs text-gray-400 sm:block">
                Enter to send · Shift+Enter for new line · paste images
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Device Auth Modal ── */}
      {deviceAuth && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
          onClick={e => e.target === e.currentTarget && cancelDeviceAuth()}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-gray-200 p-7 shadow-2xl"
            style={{ backgroundColor: '#f7f6f2' }}
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Connect GitHub</h2>
                <p className="mt-0.5 text-xs text-gray-500">Device authorization flow</p>
              </div>
              <button
                onClick={cancelDeviceAuth}
                className="rounded-lg p-1 text-gray-400 hover:bg-black/6 hover:text-gray-700"
                aria-label="Cancel"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {deviceAuth.status === 'error'
              ? (
                  <div className="space-y-4">
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {deviceAuth.errorMsg ?? 'Something went wrong.'}
                    </p>
                    <button
                      onClick={cancelDeviceAuth}
                      className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:opacity-85"
                    >
                      Dismiss
                    </button>
                  </div>
                )
              : (
                  <div className="space-y-5">
                    <p className="text-sm text-gray-600">
                      Visit the URL below and enter the code to authorize Ona.
                    </p>

                    {/* Code display */}
                    <div className="rounded-xl border border-gray-300 bg-white px-4 py-4 text-center">
                      <p className="mb-1 text-xs font-medium uppercase tracking-widest text-gray-400">Your code</p>
                      <p className="font-mono text-2xl font-bold tracking-widest text-gray-900">
                        {deviceAuth.user_code}
                      </p>
                    </div>

                    {/* Open GitHub button */}
                    <a
                      href={deviceAuth.verification_uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:opacity-85"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 0C3.58 0 0 3.67 0 8.2c0 3.62 2.29 6.69 5.47 7.77.4.08.55-.18.55-.4 0-.2-.01-.86-.01-1.56-2.01.38-2.53-.5-2.69-.95-.09-.23-.48-.95-.82-1.14-.28-.16-.68-.55-.01-.56.63-.01 1.08.59 1.23.83.72 1.24 1.87.89 2.33.68.07-.53.28-.89.51-1.1-1.78-.21-3.64-.91-3.64-4.04 0-.89.31-1.62.82-2.19-.08-.21-.36-1.04.08-2.16 0 0 .67-.22 2.2.84A7.37 7.37 0 018 3.95c.68 0 1.36.09 2 .27 1.53-1.06 2.2-.84 2.2-.84.44 1.12.16 1.95.08 2.16.51.57.82 1.3.82 2.19 0 3.14-1.87 3.83-3.65 4.04.29.25.54.74.54 1.5 0 1.09-.01 1.96-.01 2.23 0 .22.15.48.55.4A8.13 8.13 0 0016 8.2C16 3.67 12.42 0 8 0z" />
                      </svg>
                      Open {deviceAuth.verification_uri.replace('https://', '')}
                    </a>

                    {/* Polling indicator */}
                    <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                      <span
                        className="inline-block size-1.5 rounded-full bg-green-400"
                        style={{ animation: 'ona-pulse 1.2s ease-in-out infinite' }}
                      />
                      Waiting for authorization…
                    </div>
                  </div>
                )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes ona-pulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.3); opacity: 1; }
        }
        @media (hover: none) {
          .delete-btn { opacity: 1 !important; }
          .copy-btn { opacity: 1 !important; }
        }
      `}
      </style>
    </div>
  );
}
