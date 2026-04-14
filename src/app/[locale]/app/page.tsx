'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

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

const SUGGESTIONS = [
  'Weekly digest of changed files',
  'Review open pull requests',
  'Find and fix CVEs in my repos',
  'Migrate a COBOL service to Java',
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

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  const text = typeof msg.content === 'string'
    ? msg.content
    : (msg.content.find(p => p.type === 'text') as { type: 'text'; text: string } | undefined)?.text ?? '';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
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
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'rounded-tr-sm bg-gray-900 text-white'
              : 'rounded-tl-sm border border-gray-200 text-gray-800'
          }`}
          style={!isUser ? { backgroundColor: '#eceae4' } : {}}
        >
          {text}
        </div>
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
      <div className="shrink-0 px-3 pt-4 pb-2">
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
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        {loadingHistory
          ? (
              <div className="px-3 py-4 text-xs text-gray-400">Loading history…</div>
            )
          : conversations.filter(c => c.messages.length > 0).map(c => (
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
          ))}
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
        <button
          onClick={createNewChat}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-black/6 hover:text-gray-900 active:bg-black/10"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span className="hidden sm:inline">New task</span>
        </button>
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
                      Describe a task and a background agent will execute it end-to-end, then open a pull request.
                    </p>
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

      <style>{`
        @keyframes ona-pulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.3); opacity: 1; }
        }
        @media (hover: none) {
          .delete-btn { opacity: 1 !important; }
        }
      `}
      </style>
    </div>
  );
}
