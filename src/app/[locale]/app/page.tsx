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
      <div className="max-w-[80%] space-y-2">
        {msg.imagePreview && (
          <img
            src={msg.imagePreview}
            alt="Uploaded"
            className="max-h-48 rounded-xl border border-gray-200 object-cover"
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
            style={{ animation: `pulse 1s ease-in-out ${i * 0.2}s infinite` }}
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
  const [activeId, setActiveId] = useState<string>(() => '');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function createNewChat() {
    const c = newConversation();
    setConversations(prev => [c, ...prev]);
    setActiveId(c.id);
    setInput('');
    setPendingImage(null);
  }

  function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setConversations(prev => {
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

  function updateConversation(id: string, updater: (c: Conversation) => Conversation) {
    setConversations(prev => prev.map(c => c.id === id ? updater(c) : c));
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

    updateConversation(activeId, c => ({
      ...c,
      messages: [...c.messages, userMsg],
      title: isFirstMessage ? title : c.title,
    }));

    setInput('');
    setPendingImage(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setLoading(true);

    const historyMessages = [...currentConv.messages, userMsg];
    const assistantId = crypto.randomUUID();

    updateConversation(activeId, c => ({
      ...c,
      messages: [...c.messages, userMsg, { id: assistantId, role: 'assistant', content: '' }],
      title: isFirstMessage ? title : c.title,
    }));

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
      setConversations(prev =>
        prev.map(c =>
          c.id === activeId
            ? {
                ...c,
                messages: c.messages.map(m =>
                  m.id === assistantId
                    ? { ...m, content: `Something went wrong: ${(err as Error).message}` }
                    : m,
                ),
              }
            : c,
        ),
      );
    } finally {
      setLoading(false);
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
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
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

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: BG }}>
      {/* ── Top header ── */}
      <header
        className="flex h-14 shrink-0 items-center justify-between border-b border-black/8 px-4"
        style={{ backgroundColor: 'rgba(247,246,242,0.92)', backdropFilter: 'blur(14px)' }}
      >
        <div className="flex items-center gap-3">
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-black/6 hover:text-gray-900"
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
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-black/6 hover:text-gray-900"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          New task
        </button>
      </header>

      {/* ── Body: sidebar + chat ── */}
      <div className="flex min-h-0 flex-1">

        {/* ── Sidebar ── */}
        {sidebarOpen && (
          <aside
            className="flex w-64 shrink-0 flex-col border-r border-black/8 overflow-hidden"
            style={{ backgroundColor: SIDEBAR_BG }}
          >
            <div className="flex-shrink-0 px-3 pt-4 pb-2">
              <button
                onClick={createNewChat}
                className="flex w-full items-center gap-2 rounded-xl border border-black/8 px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-black/6"
                style={{ backgroundColor: 'rgba(255,255,255,0.5)' }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                New task
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
              {conversations.length === 0
                ? (
                    <p className="px-2 py-3 text-xs text-gray-400">No tasks yet</p>
                  )
                : (
                    conversations.map(c => (
                      <div
                        key={c.id}
                        className={`group relative flex w-full items-start rounded-lg px-3 py-2.5 text-left transition-colors ${
                          c.id === activeId
                            ? 'bg-black/8 text-gray-900'
                            : 'text-gray-600 hover:bg-black/5 hover:text-gray-900'
                        }`}
                      >
                        <button
                          onClick={() => setActiveId(c.id)}
                          className="min-w-0 flex-1 text-left"
                          aria-label={`Switch to task: ${c.title}`}
                        >
                          <p className="truncate pr-5 text-sm font-medium leading-tight">{c.title}</p>
                          <p className="mt-0.5 text-xs text-gray-400">{relativeTime(c.createdAt)}</p>
                        </button>
                        <button
                          onClick={e => deleteConversation(c.id, e)}
                          className="absolute right-2 top-2.5 shrink-0 rounded p-0.5 text-gray-300 opacity-0 transition-opacity hover:text-gray-600 group-hover:opacity-100"
                          aria-label="Delete task"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                    ))
                  )}
            </div>

            <div className="shrink-0 border-t border-black/8 px-3 py-3">
              <p className="text-xs text-gray-400">Powered by Kimi K2.5</p>
            </div>
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
                      className="mb-3 text-3xl text-gray-900 sm:text-4xl"
                      style={{ fontFamily: SERIF, fontWeight: 400 }}
                    >
                      What should Ona do?
                    </h1>
                    <p className="mb-8 max-w-sm text-sm text-gray-500">
                      Describe a task and a background agent will execute it end-to-end, then open a pull request.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {SUGGESTIONS.map(s => (
                        <button
                          key={s}
                          onClick={() => send(s)}
                          className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:border-gray-500 hover:text-gray-950"
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

          {/* Input bar */}
          <div className="shrink-0 border-t border-gray-200 px-4 py-4 sm:px-8">
            <div className="mx-auto max-w-2xl">
              {pendingImage && (
                <div className="mb-2 flex items-center gap-2">
                  <img src={pendingImage} alt="Pending" className="h-16 rounded-lg border border-gray-200 object-cover" />
                  <button
                    onClick={() => setPendingImage(null)}
                    className="rounded-full p-1 text-gray-400 hover:text-gray-700"
                    aria-label="Remove image"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              )}

              <div
                className="flex items-end gap-2 rounded-2xl border border-gray-300 px-3 py-3 transition-shadow focus-within:border-gray-400 focus-within:shadow-sm"
                style={{ backgroundColor: '#fff' }}
              >
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mb-0.5 shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Attach image"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
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
                  className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
                  style={{ maxHeight: '180px' }}
                />

                <button
                  onClick={() => send(input, pendingImage ?? undefined)}
                  disabled={!canSend}
                  aria-label="Send"
                  className="mb-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-950 text-white transition-opacity hover:opacity-80 disabled:opacity-25"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 12V2M7 2L3 6M7 2L11 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <p className="mt-2 text-center text-xs text-gray-400">
                Enter to send · Shift+Enter for new line · paste or
                {' '}
                <button onClick={() => fileInputRef.current?.click()} className="underline hover:text-gray-600">
                  upload
                </button>
                {' '}
                images
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.3); opacity: 1; }
        }
      `}
      </style>
    </div>
  );
}
