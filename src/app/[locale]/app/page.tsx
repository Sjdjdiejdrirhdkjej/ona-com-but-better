'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

const SERIF = 'Georgia, "Times New Roman", serif';

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type SubStep = {
  label: string;
  status: 'running' | 'done' | 'error';
};

type ToolStep = {
  label: string;
  status: 'running' | 'done' | 'error';
  subSteps?: SubStep[];
};

type Message = {
  id: string;
  role: 'user' | 'assistant' | 'tool_steps';
  content: string | ContentPart[] | ToolStep[];
  imagePreview?: string;
};

type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  activeJobId?: string | null;
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
  expires_at: number;
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
                <code className="rounded bg-black/10 dark:bg-white/10 px-1 py-0.5 font-mono text-xs">{children}</code>
              );
        },
        pre: ({ children }) => <pre className="mb-2 mt-1 overflow-hidden rounded-lg">{children}</pre>,
        blockquote: ({ children }) => (
          <blockquote className="mb-2 border-l-2 border-gray-400 dark:border-gray-500 pl-3 italic text-gray-600 dark:text-gray-400">
            {children}
          </blockquote>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-70">
            {children}
          </a>
        ),
        hr: () => <hr className="my-2 border-gray-300 dark:border-gray-600" />,
        table: ({ children }) => (
          <div className="mb-2 overflow-x-auto">
            <table className="min-w-full text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-left font-semibold">{children}</th>,
        td: ({ children }) => <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">{children}</td>,
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
      className="copy-btn mt-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-gray-400 dark:text-gray-500 opacity-0 transition-all hover:bg-black/5 dark:hover:bg-white/8 hover:text-gray-600 dark:hover:text-gray-300 group-hover:opacity-100"
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

function CopyDeviceCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <button
      onClick={handleCopy}
      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 py-1.5 text-xs text-gray-500 dark:text-gray-400 transition-colors hover:border-gray-400 hover:text-gray-800 dark:hover:text-gray-100"
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
  );
}

function CountdownTimer({ expiresAt, onExpired }: { expiresAt: number; onExpired: () => void }) {
  const [secsLeft, setSecsLeft] = useState<number | null>(null);
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  useEffect(() => {
    setSecsLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
  }, [expiresAt]);

  useEffect(() => {
    if (secsLeft === null) return;
    if (secsLeft <= 0) {
      onExpiredRef.current();
      return;
    }
    const id = setTimeout(() => setSecsLeft(s => (s !== null ? Math.max(0, s - 1) : null)), 1000);
    return () => clearTimeout(id);
  }, [secsLeft]);

  if (secsLeft === null) return null;

  const mins = Math.floor(secsLeft / 60);
  const secs = secsLeft % 60;
  const isLow = secsLeft <= 60;

  return (
    <p className={`text-center text-xs ${isLow ? 'text-red-500' : 'text-gray-400'}`}>
      Code expires in
      {' '}
      <span className="font-medium tabular-nums">
        {mins > 0 ? `${mins}m ` : ''}
        {String(secs).padStart(2, '0')}
        s
      </span>
    </p>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  const text = typeof msg.content === 'string'
    ? msg.content
    : Array.isArray(msg.content) && (msg.content as ContentPart[])[0]?.type === 'text'
      ? ((msg.content as ContentPart[]).find(p => p.type === 'text') as { type: 'text'; text: string } | undefined)?.text ?? ''
      : '';

  return (
    <div className={`group flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && <OnaAvatar />}
      <div className="max-w-[85%] space-y-2 sm:max-w-[80%]">
        {msg.imagePreview && (
          <img
            src={msg.imagePreview}
            alt="Uploaded"
            className="max-h-48 w-full rounded-xl border border-gray-200 dark:border-gray-700 object-cover"
          />
        )}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? 'rounded-tr-sm bg-gray-900 text-white whitespace-pre-wrap'
              : 'rounded-tl-sm border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200'
          }`}
          style={!isUser ? { backgroundColor: 'var(--bg-2)' } : {}}
        >
          {isUser ? text : <AssistantMarkdown text={text} />}
        </div>
        {!isUser && text && <CopyButton text={text} />}
      </div>
    </div>
  );
}

function ToolStepIcon({ status }: { status: ToolStep['status'] }) {
  if (status === 'done') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-green-500">
        <circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1.1" />
        <path d="M3.5 6l1.8 1.8 3.2-3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === 'error') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-red-400">
        <circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1.1" />
        <path d="M4 4l4 4M8 4l-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-indigo-400" style={{ animation: 'ona-spin 1s linear infinite' }}>
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" strokeOpacity="0.25" />
      <path d="M6 1.5A4.5 4.5 0 0110.5 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      className="shrink-0 transition-transform"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
    >
      <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ToolStepsBlock({ steps }: { steps: ToolStep[] }) {
  const [expandedLabels, setExpandedLabels] = useState<Set<string>>(new Set());

  function toggleLabel(label: string) {
    setExpandedLabels(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <div className="flex justify-start">
      <OnaAvatar />
      <div
        className="rounded-2xl rounded-tl-sm border border-gray-200 dark:border-gray-700 px-4 py-3 space-y-1.5"
        style={{ backgroundColor: 'var(--bg-2)' }}
      >
        {steps.map((step, i) => {
          const hasSubSteps = !!(step.subSteps && step.subSteps.length > 0);
          const isOpen = expandedLabels.has(step.label) || (step.status === 'running' && hasSubSteps);
          return (
            <div key={i}>
              <div className="flex items-center gap-2">
                <ToolStepIcon status={step.status} />
                <span
                  className={`text-xs ${
                    step.status === 'done'
                      ? 'text-gray-400 dark:text-gray-500'
                      : step.status === 'error'
                        ? 'text-red-400'
                        : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {step.label}
                  {step.status === 'running' && !hasSubSteps ? '…' : ''}
                </span>
                {hasSubSteps && (
                  <button
                    onClick={() => toggleLabel(step.label)}
                    className="ml-1 flex items-center gap-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    <ChevronIcon open={isOpen} />
                    <span className="text-xs tabular-nums">
                      {step.subSteps!.length}
                    </span>
                  </button>
                )}
              </div>
              {hasSubSteps && isOpen && (
                <div className="mt-1.5 ml-4 pl-3 space-y-1 border-l border-gray-200 dark:border-gray-700">
                  {step.subSteps!.map((sub, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <ToolStepIcon status={sub.status} />
                      <span
                        className={`text-xs ${
                          sub.status === 'done'
                            ? 'text-gray-400 dark:text-gray-500'
                            : sub.status === 'error'
                              ? 'text-red-400'
                              : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {sub.label}
                        {sub.status === 'running' ? '…' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <OnaAvatar />
      <div
        className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-gray-200 dark:border-gray-700 px-4 py-3"
        style={{ backgroundColor: 'var(--bg-2)' }}
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

function BackgroundWorkingBanner() {
  return (
    <div className="flex justify-start">
      <OnaAvatar />
      <div
        className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-indigo-200 dark:border-indigo-800 px-4 py-3"
        style={{ backgroundColor: 'var(--bg-2)' }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-indigo-400" style={{ animation: 'ona-spin 1s linear infinite' }}>
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" strokeOpacity="0.25" />
          <path d="M6 1.5A4.5 4.5 0 0110.5 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span className="text-xs text-indigo-500 dark:text-indigo-400">Working in background…</span>
      </div>
    </div>
  );
}

function newConversation(): Conversation {
  return { id: crypto.randomUUID(), title: 'New task', messages: [], createdAt: Date.now() };
}

export default function AppPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
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
  const [atMention, setAtMention] = useState<{ query: string; caretPos: number } | null>(null);
  const [sandboxFiles, setSandboxFiles] = useState<string[]>([]);
  const [atMentionIndex, setAtMentionIndex] = useState(0);
  const [atMentionFetching, setAtMentionFetching] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bgPollTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncedIds = useRef<Set<string>>(new Set());
  const sandboxFilesCacheRef = useRef<Map<string, string[]>>(new Map());

  // Load conversation history from DB on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch('/api/conversations');
        if (!res.ok) throw new Error('Failed to load history');
        const data = await res.json() as Array<{
          id: string;
          title: string;
          createdAt: string;
          activeJobId: string | null;
          messages: Array<{ id: string; role: string; content: unknown }>;
        }>;

        if (data.length > 0) {
          const loaded: Conversation[] = data.map(c => ({
            id: c.id,
            title: c.title,
            createdAt: new Date(c.createdAt).getTime(),
            activeJobId: c.activeJobId,
            messages: c.messages.map(m => ({
              id: m.id,
              role: m.role as Message['role'],
              content: m.content as Message['content'],
            })),
          }));
          loaded.forEach(c => syncedIds.current.add(c.id));
          setConversations([newConversation(), ...loaded]);

          loaded.forEach(c => {
            if (c.activeJobId) {
              scheduleBackgroundPoll(c.id, c.activeJobId, 0);
            }
          });
        } else {
          setConversations([newConversation()]);
        }
      } catch {
        setConversations([newConversation()]);
      } finally {
        setLoadingHistory(false);
      }
    }
    loadHistory();
  }, []);

  useEffect(() => {
    setAtMention(null);
    setSandboxFiles([]);
  }, [activeId]);

  function scheduleBackgroundPoll(convId: string, jobId: string, cursor: number) {
    const existing = bgPollTimersRef.current.get(convId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => pollBackgroundJob(convId, jobId, cursor), 3000);
    bgPollTimersRef.current.set(convId, timer);
  }

  async function pollBackgroundJob(convId: string, jobId: string, cursor: number) {
    try {
      const res = await fetch(`/api/jobs/${jobId}/events?after=${cursor}`);
      if (!res.ok) {
        stopBackgroundPoll(convId);
        return;
      }
      const data = await res.json() as {
        events: Array<{ id: number; type: string; data: Record<string, unknown> }>;
        done: boolean;
        status: string;
      };

      if (data.events.length > 0 || data.done) {
        const lastId = data.events.at(-1)?.id ?? cursor;

        setConversations(prev => {
          const conv = prev.find(c => c.id === convId);
          if (!conv) return prev;

          let messages = [...conv.messages];

          for (const ev of data.events) {
            if (ev.type === 'tool_call') {
              const tools = (ev.data.tools as string[]) ?? [];
              const toolStepsMsgId = ev.data.toolStepsMsgId as string ?? crypto.randomUUID();
              const nextAssistantMsgId = ev.data.nextAssistantMsgId as string ?? crypto.randomUUID();
              messages = messages.filter(m => !(m.role === 'assistant' && m.content === ''));
              messages.push({ id: toolStepsMsgId, role: 'tool_steps', content: tools.map(l => ({ label: l, status: 'running' as const })) });
              messages.push({ id: nextAssistantMsgId, role: 'assistant', content: '' });
            } else if (ev.type === 'tool_start') {
              const tool = ev.data.tool as string;
              messages = messages.map(m =>
                m.role === 'tool_steps'
                  ? { ...m, content: (m.content as ToolStep[]).map(s => s.label === tool ? { ...s, status: 'running' as const } : s) }
                  : m,
              );
            } else if (ev.type === 'tool_complete') {
              const tool = ev.data.tool as string;
              const hasError = !!ev.data.error;
              messages = messages.map(m =>
                m.role === 'tool_steps'
                  ? { ...m, content: (m.content as ToolStep[]).map(s => s.label === tool ? { ...s, status: (hasError ? 'error' : 'done') as ToolStep['status'] } : s) }
                  : m,
              );
            } else if (ev.type === 'tool_done') {
              messages = messages.map(m =>
                m.role === 'tool_steps'
                  ? { ...m, content: (m.content as ToolStep[]).map(s => ({ ...s, status: s.status === 'running' ? 'done' as const : s.status })) }
                  : m,
              );
            } else if (ev.type === 'librarian_step_start') {
              const parentLabel = ev.data.parentLabel as string;
              const step = ev.data.step as string;
              messages = messages.map(m =>
                m.role === 'tool_steps'
                  ? {
                      ...m,
                      content: (m.content as ToolStep[]).map(s =>
                        s.label === parentLabel
                          ? { ...s, subSteps: [...(s.subSteps ?? []), { label: step, status: 'running' as const }] }
                          : s,
                      ),
                    }
                  : m,
              );
            } else if (ev.type === 'librarian_step_complete') {
              const parentLabel = ev.data.parentLabel as string;
              const step = ev.data.step as string;
              const hasError = !!ev.data.error;
              messages = messages.map(m =>
                m.role === 'tool_steps'
                  ? {
                      ...m,
                      content: (m.content as ToolStep[]).map(s =>
                        s.label === parentLabel
                          ? {
                              ...s,
                              subSteps: (s.subSteps ?? []).map(sub =>
                                sub.label === step
                                  ? { ...sub, status: (hasError ? 'error' : 'done') as SubStep['status'] }
                                  : sub,
                              ),
                            }
                          : s,
                      ),
                    }
                  : m,
              );
            } else if (ev.type === 'content') {
              const text = ev.data.text as string ?? '';
              const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
              if (lastAssistant) {
                messages = messages.map(m =>
                  m.id === lastAssistant.id
                    ? { ...m, content: (typeof m.content === 'string' ? m.content : '') + text }
                    : m,
                );
              }
            }
          }

          if (data.done) {
            const updatedConv = { ...conv, messages, activeJobId: null };
            return prev.map(c => c.id === convId ? updatedConv : c);
          }
          return prev.map(c => c.id === convId ? { ...c, messages } : c);
        });

        if (!data.done) {
          scheduleBackgroundPoll(convId, jobId, lastId);
        } else {
          stopBackgroundPoll(convId);
          refreshConversationMessages(convId);
        }
      } else {
        if (!data.done) {
          scheduleBackgroundPoll(convId, jobId, cursor);
        } else {
          stopBackgroundPoll(convId);
          refreshConversationMessages(convId);
        }
      }
    } catch {
      scheduleBackgroundPoll(convId, jobId, cursor);
    }
  }

  function stopBackgroundPoll(convId: string) {
    const timer = bgPollTimersRef.current.get(convId);
    if (timer) {
      clearTimeout(timer);
      bgPollTimersRef.current.delete(convId);
    }
  }

  async function refreshConversationMessages(convId: string) {
    try {
      const res = await fetch('/api/conversations');
      if (!res.ok) return;
      const data = await res.json() as Array<{
        id: string;
        title: string;
        createdAt: string;
        activeJobId: string | null;
        messages: Array<{ id: string; role: string; content: unknown }>;
      }>;
      const found = data.find(c => c.id === convId);
      if (!found) return;
      setConversations(prev => prev.map(c =>
        c.id === convId
          ? {
              ...c,
              activeJobId: null,
              messages: found.messages.map(m => ({
                id: m.id,
                role: m.role as Message['role'],
                content: m.content as Message['content'],
              })),
            }
          : c,
      ));
    } catch {}
  }

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
        expires_in?: number;
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
        expires_at: Date.now() + (data.expires_in ?? 900) * 1000,
        status: 'polling',
      };
      setDeviceAuth(auth);
      schedulePoll(auth);
    } catch (err) {
      setDeviceAuth({ device_code: '', user_code: '', verification_uri: '', interval: 5000, expires_at: Date.now(), status: 'error', errorMsg: (err as Error).message });
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
      const params = new URLSearchParams(window.location.search);
      const urlId = params.get('c');
      const fromUrl = urlId ? conversations.find(c => c.id === urlId) : null;
      setActiveId(fromUrl ? fromUrl.id : conversations[0]!.id);
    }
  }, [conversations, activeId]);

  useEffect(() => {
    if (!activeId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('c', activeId);
    window.history.replaceState(null, '', url.toString());
  }, [activeId]);

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
    stopBackgroundPoll(id);
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
    const historyMessages = [
      ...currentConv.messages.filter(m => m.role === 'user' || (m.role === 'assistant' && !!m.content)),
      userMsg,
    ];

    setConversations(prev => prev.map(c =>
      c.id === activeId
        ? {
            ...c,
            messages: [...c.messages, userMsg, { id: assistantId, role: 'assistant' as const, content: '' }],
            title: isFirstMessage ? title : c.title,
          }
        : c,
    ));

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

    // Tracks which assistant message is being filled with deltas
    let currentAssistantId = assistantId;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyMessages.map(m => ({ role: m.role, content: m.content })),
          conversationId: convId,
          assistantMessageId: assistantId,
        }),
      });

      if (!res.ok) {
        const details = await res.text().catch(() => '');
        throw new Error(details ? `API error ${res.status}: ${details.slice(0, 240)}` : `API error ${res.status}`);
      }

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
            const json = JSON.parse(data) as {
              delta?: string;
              type?: string;
              tools?: string[];
              tool?: string;
              error?: boolean;
              message?: string;
              jobId?: string;
              toolStepsMsgId?: string;
              nextAssistantMsgId?: string;
              parentLabel?: string;
              step?: string;
            };

            if (json.type === 'job_id' && json.jobId) {
              const jobId = json.jobId;
              setConversations(prev => prev.map(c =>
                c.id === convId ? { ...c, activeJobId: jobId } : c,
              ));
            } else if (json.type === 'tool_call' && json.tools?.length) {
              const toolStepsMsgId = json.toolStepsMsgId ?? crypto.randomUUID();
              const nextAssistantMsgId = json.nextAssistantMsgId ?? crypto.randomUUID();
              currentAssistantId = nextAssistantMsgId;

              setConversations(prev => prev.map(c => {
                if (c.id !== convId) return c;
                const newSteps: Message = {
                  id: toolStepsMsgId,
                  role: 'tool_steps',
                  content: json.tools!.map((label: string) => ({ label, status: 'running' as const })),
                };
                const newAssistant: Message = {
                  id: nextAssistantMsgId,
                  role: 'assistant',
                  content: '',
                };
                return { ...c, messages: [...c.messages, newSteps, newAssistant] };
              }));
            } else if (json.type === 'tool_start' && json.tool) {
              const tool = json.tool;
              setConversations(prev => prev.map(c => {
                if (c.id !== convId) return c;
                return {
                  ...c,
                  messages: c.messages.map(m =>
                    m.role === 'tool_steps'
                      ? {
                          ...m,
                          content: (m.content as ToolStep[]).map(s =>
                            s.label === tool ? { ...s, status: 'running' as const } : s,
                          ),
                        }
                      : m,
                  ),
                };
              }));
            } else if (json.type === 'tool_complete' && json.tool) {
              const tool = json.tool;
              const hasError = !!json.error;
              setConversations(prev => prev.map(c => {
                if (c.id !== convId) return c;
                return {
                  ...c,
                  messages: c.messages.map(m =>
                    m.role === 'tool_steps'
                      ? {
                          ...m,
                          content: (m.content as ToolStep[]).map(s =>
                            s.label === tool
                              ? { ...s, status: (hasError ? 'error' : 'done') as ToolStep['status'] }
                              : s,
                          ),
                        }
                      : m,
                  ),
                };
              }));
            } else if (json.type === 'tool_done') {
              setConversations(prev => prev.map(c => {
                if (c.id !== convId) return c;
                return {
                  ...c,
                  messages: c.messages.map(m =>
                    m.role === 'tool_steps'
                      ? {
                          ...m,
                          content: (m.content as ToolStep[]).map(s => ({
                            ...s,
                            status: s.status === 'running' ? 'done' as const : s.status,
                          })),
                        }
                      : m,
                  ),
                };
              }));
            } else if (json.type === 'librarian_step_start' && json.parentLabel && json.step) {
              const { parentLabel, step } = json as { parentLabel: string; step: string };
              setConversations(prev => prev.map(c => {
                if (c.id !== convId) return c;
                return {
                  ...c,
                  messages: c.messages.map(m =>
                    m.role === 'tool_steps'
                      ? {
                          ...m,
                          content: (m.content as ToolStep[]).map(s =>
                            s.label === parentLabel
                              ? { ...s, subSteps: [...(s.subSteps ?? []), { label: step, status: 'running' as const }] }
                              : s,
                          ),
                        }
                      : m,
                  ),
                };
              }));
            } else if (json.type === 'librarian_step_complete' && json.parentLabel && json.step) {
              const { parentLabel, step, error: hasError } = json as { parentLabel: string; step: string; error?: boolean };
              setConversations(prev => prev.map(c => {
                if (c.id !== convId) return c;
                return {
                  ...c,
                  messages: c.messages.map(m =>
                    m.role === 'tool_steps'
                      ? {
                          ...m,
                          content: (m.content as ToolStep[]).map(s =>
                            s.label === parentLabel
                              ? {
                                  ...s,
                                  subSteps: (s.subSteps ?? []).map(sub =>
                                    sub.label === step
                                      ? { ...sub, status: (hasError ? 'error' : 'done') as SubStep['status'] }
                                      : sub,
                                  ),
                                }
                              : s,
                          ),
                        }
                      : m,
                  ),
                };
              }));
            } else if (json.type === 'error' && json.message) {
              throw new Error(json.message);
            } else if (json.delta) {
              const delta = json.delta;
              const targetId = currentAssistantId;
              setConversations(prev =>
                prev.map(c =>
                  c.id === convId
                    ? {
                        ...c,
                        messages: c.messages.map(m =>
                          m.id === targetId
                            ? { ...m, content: (typeof m.content === 'string' ? m.content : '') + delta }
                            : m,
                        ),
                      }
                    : c,
                ),
              );
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Unexpected token') throw e;
          }
        }
      }
    } catch (err) {
      const errText = `Something went wrong: ${(err as Error).message}`;
      const targetId = currentAssistantId;
      setConversations(prev =>
        prev.map(c =>
          c.id === convId
            ? {
                ...c,
                messages: c.messages.map(m =>
                  m.id === targetId
                    ? { ...m, content: errText }
                    : m,
                ),
              }
            : c,
        ),
      );
    } finally {
      setLoading(false);
      setConversations(prev => prev.map(c =>
        c.id === convId ? { ...c, activeJobId: null } : c,
      ));
    }
  }, [activeId, conversations, loading]);

  function detectAtMention(value: string, selectionStart: number) {
    const textBefore = value.slice(0, selectionStart);
    const match = textBefore.match(/@(\S*)$/);
    if (match) {
      return { query: match[1] ?? '', caretPos: selectionStart - (match[0]?.length ?? 0) };
    }
    return null;
  }

  function fuzzyMatch(query: string, target: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    let qi = 0;
    for (let i = 0; i < t.length && qi < q.length; i++) {
      if (t[i] === q[qi]) qi++;
    }
    return qi === q.length;
  }

  async function fetchSandboxFiles() {
    if (!activeId) return;
    const cached = sandboxFilesCacheRef.current.get(activeId);
    if (cached) {
      setSandboxFiles(cached);
      return;
    }
    setAtMentionFetching(true);
    try {
      const res = await fetch(`/api/sandbox/files?conversationId=${activeId}`);
      if (res.ok) {
        const data = await res.json() as { files: string[] };
        const files = data.files ?? [];
        sandboxFilesCacheRef.current.set(activeId, files);
        setSandboxFiles(files);
      }
    } catch {}
    finally {
      setAtMentionFetching(false);
    }
  }

  function selectAtFile(file: string) {
    if (!atMention || !textareaRef.current) return;
    const fileName = file.split('/').pop() ?? file;
    const atStart = atMention.caretPos;
    const cursorPos = textareaRef.current.selectionStart ?? input.length;
    const before = input.slice(0, atStart);
    const after = input.slice(cursorPos);
    const newInput = `${before}@${fileName} ${after}`;
    setInput(newInput);
    setAtMention(null);
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = atStart + fileName.length + 2;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
      }
    }, 0);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (atMention) {
      const filteredCount = sandboxFiles.filter(f => fuzzyMatch(atMention.query, f)).length;
      if (filteredCount > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setAtMentionIndex(i => Math.min(i + 1, filteredCount - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setAtMentionIndex(i => Math.max(i - 1, 0));
          return;
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          const filtered = sandboxFiles.filter(f => fuzzyMatch(atMention.query, f));
          const chosen = filtered[atMentionIndex];
          if (chosen) {
            e.preventDefault();
            selectAtFile(chosen);
            return;
          }
        }
      }
      if (e.key === 'Escape') {
        setAtMention(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input, pendingImage ?? undefined);
    }
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    const selectionStart = e.target.selectionStart ?? value.length;
    setInput(value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    const mention = detectAtMention(value, selectionStart);
    if (mention) {
      setAtMention(mention);
      setAtMentionIndex(0);
      fetchSandboxFiles();
    } else {
      setAtMention(null);
    }
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
  const isBackgroundRunning = !loading && !!activeConversation?.activeJobId;
  const visibleAgentMsgs = messages.filter(m =>
    m.role === 'tool_steps' || (m.role === 'assistant' && !!m.content),
  );
  const showTypingIndicator = loading && visibleAgentMsgs.length === 0;

  const sidebarContent = (
    <>
      <div className="shrink-0 px-3 pt-4 pb-2 space-y-2">
        <button
          onClick={createNewChat}
          className="flex w-full items-center gap-2 rounded-xl border border-black/8 dark:border-white/8 px-3 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-black/6 dark:hover:bg-white/8 active:bg-black/10 dark:active:bg-white/10"
          style={{ backgroundColor: 'var(--bg-card)' }}
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
            className="w-full rounded-lg border border-black/8 dark:border-white/8 bg-white/60 dark:bg-white/5 py-1.5 pl-7 pr-3 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-gray-300 dark:focus:border-gray-600 focus:bg-white dark:focus:bg-white/8 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
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
              <div className="px-3 py-4 text-xs text-gray-400 dark:text-gray-500">Loading history…</div>
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
                  <div className="px-3 py-4 text-xs text-gray-400 dark:text-gray-500">
                    {q ? 'No tasks match your search.' : 'No tasks yet.'}
                  </div>
                );
              }
              return filtered.map(c => (
                <div
                  key={c.id}
                  className={`group flex w-full items-stretch overflow-hidden rounded-xl text-left transition-colors ${
                    c.id === activeId
                      ? 'bg-black/8 dark:bg-white/10 text-gray-900 dark:text-gray-100'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/8 hover:text-gray-900 dark:hover:text-gray-100 active:bg-black/8 dark:active:bg-white/10'
                  }`}
                >
                  <button
                    onClick={() => { setActiveId(c.id); closeSidebarOnMobile(); }}
                    className="min-w-0 flex-1 px-3 py-3 text-left"
                    aria-label={`Switch to task: ${c.title}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium leading-tight">{c.title}</p>
                      {c.activeJobId && (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="shrink-0 text-indigo-400" style={{ animation: 'ona-spin 1s linear infinite' }}>
                          <circle cx="4" cy="4" r="3" stroke="currentColor" strokeWidth="1" strokeOpacity="0.25" />
                          <path d="M4 1A3 3 0 017 4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                        </svg>
                      )}
                    </div>
                    <p suppressHydrationWarning className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{relativeTime(c.createdAt)}</p>
                  </button>
                  <button
                    onClick={e => deleteConversation(c.id, e)}
                    className="delete-btn flex w-11 shrink-0 items-center justify-center border-l border-black/5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-inset dark:border-white/8 dark:text-gray-500 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                    aria-label="Delete task"
                    title="Delete task"
                  >
                    <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ));
            })()}
      </div>

      <div className="shrink-0 border-t border-black/8 dark:border-white/8 px-3 py-3">
        <p className="text-xs text-gray-400 dark:text-gray-500">Powered by Claude Opus 4.6</p>
      </div>
    </>
  );

  return (
    <div className="flex flex-col" style={{ backgroundColor: 'var(--bg)', height: '100dvh' }}>
      {/* ── Header ── */}
      <header
        className="flex h-14 shrink-0 items-center justify-between border-b border-black/8 dark:border-white/8 px-4"
        style={{ backgroundColor: 'var(--bg-header)', backdropFilter: 'blur(14px)' }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="flex size-9 items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 transition-colors hover:bg-black/6 dark:hover:bg-white/8 hover:text-gray-900 dark:hover:text-gray-100 active:bg-black/10 dark:active:bg-white/10"
            aria-label="Toggle sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="4" width="14" height="1.4" rx="0.7" fill="currentColor" />
              <rect x="2" y="8.3" width="14" height="1.4" rx="0.7" fill="currentColor" />
              <rect x="2" y="12.6" width="14" height="1.4" rx="0.7" fill="currentColor" />
            </svg>
          </button>
          <Link href="/" className="text-base font-bold tracking-tight text-gray-950 dark:text-gray-50">
            ONA
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {githubStatus?.connected
            ? (
                <button
                  onClick={disconnectGitHub}
                  title={`Connected as ${githubStatus.user?.login ?? 'GitHub user'}. Click to disconnect.`}
                  className="flex items-center gap-2 rounded-lg border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 transition-colors hover:bg-black/6 dark:hover:bg-white/8 hover:text-gray-950 dark:hover:text-gray-50 active:bg-black/10"
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
                  className="flex items-center gap-2 rounded-lg border border-black/10 dark:border-white/10 px-3 py-2 text-sm transition-colors bg-gray-950 dark:bg-gray-100 dark:text-gray-900 text-white hover:opacity-85 active:opacity-75 disabled:pointer-events-none disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0C3.58 0 0 3.67 0 8.2c0 3.62 2.29 6.69 5.47 7.77.4.08.55-.18.55-.4 0-.2-.01-.86-.01-1.56-2.01.38-2.53-.5-2.69-.95-.09-.23-.48-.95-.82-1.14-.28-.16-.68-.55-.01-.56.63-.01 1.08.59 1.23.83.72 1.24 1.87.89 2.33.68.07-.53.28-.89.51-1.1-1.78-.21-3.64-.91-3.64-4.04 0-.89.31-1.62.82-2.19-.08-.21-.36-1.04.08-2.16 0 0 .67-.22 2.2.84A7.37 7.37 0 018 3.95c.68 0 1.36.09 2 .27 1.53-1.06 2.2-.84 2.2-.84.44 1.12.16 1.95.08 2.16.51.57.82 1.3.82 2.19 0 3.14-1.87 3.83-3.65 4.04.29.25.54.74.54 1.5 0 1.09-.01 1.96-.01 2.23 0 .22.15.48.55.4A8.13 8.13 0 0016 8.2C16 3.67 12.42 0 8 0z" />
                  </svg>
                  <span className="hidden sm:inline">Connect GitHub</span>
                </button>
              )}
          <button
            onClick={createNewChat}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-600 dark:text-gray-400 transition-colors hover:bg-black/6 dark:hover:bg-white/8 hover:text-gray-900 dark:hover:text-gray-100 active:bg-black/10"
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
            className={`flex shrink-0 flex-col overflow-hidden border-r border-black/8 dark:border-white/8 ${
              isMobile
                ? 'absolute left-0 top-0 z-30 h-full w-72 shadow-xl'
                : 'relative w-64'
            }`}
            style={{ backgroundColor: 'var(--bg-sidebar)' }}
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
                      className="mb-3 text-2xl text-gray-900 dark:text-gray-100 sm:text-4xl"
                      style={{ fontFamily: SERIF, fontWeight: 400 }}
                    >
                      What should Ona do?
                    </h1>
                    <p className="mb-7 max-w-xs text-sm text-gray-500 dark:text-gray-400 sm:max-w-sm">
                      Connect GitHub, describe a task, and a background agent can inspect repos, create a branch, commit changes, and open a pull request.
                    </p>
                    {githubStatus?.configured === false && (
                      <p className="mb-4 max-w-sm rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
                        GitHub Device Auth needs GITHUB_CLIENT_ID before users can connect their repositories.
                      </p>
                    )}
                    <div className="flex flex-wrap justify-center gap-2">
                      {SUGGESTIONS.map(s => (
                        <button
                          key={s}
                          onClick={() => send(s)}
                          className="rounded-full border border-gray-300 dark:border-gray-700 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 transition-colors hover:border-gray-500 dark:hover:border-gray-500 hover:text-gray-950 dark:hover:text-gray-50 active:bg-gray-100 dark:active:bg-gray-800"
                          style={{ backgroundColor: 'var(--bg)' }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              : (
                  <div className="mx-auto max-w-2xl space-y-5">
                    {messages
                      .filter(m => m.role === 'tool_steps' || m.role === 'user' || !!m.content)
                      .map(msg => (
                        msg.role === 'tool_steps'
                          ? <ToolStepsBlock key={msg.id} steps={msg.content as ToolStep[]} />
                          : <MessageBubble key={msg.id} msg={msg} />
                      ))}
                    {showTypingIndicator && (
                      <TypingIndicator />
                    )}
                    {isBackgroundRunning && (
                      <BackgroundWorkingBanner />
                    )}
                    <div ref={bottomRef} />
                  </div>
                )}
          </div>

          {/* ── Input bar ── */}
          <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 px-3 py-3 sm:px-6 sm:py-4">
            <div className="relative mx-auto max-w-2xl">
              {/* @ mention file picker */}
              {atMention && (
                <div
                  className="absolute bottom-full left-0 right-0 z-20 mb-1.5 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg"
                  style={{ backgroundColor: 'var(--bg-card)' }}
                >
                  <div className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Sandbox files</span>
                    {atMentionFetching && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">Loading…</span>
                    )}
                  </div>
                  {(() => {
                    const filtered = sandboxFiles.filter(f => fuzzyMatch(atMention.query, f)).slice(0, 8);
                    if (!atMentionFetching && filtered.length === 0) {
                      return (
                        <div className="px-3 py-2.5 text-xs text-gray-400 dark:text-gray-500">
                          {sandboxFiles.length === 0 ? 'No sandbox active for this task' : 'No matching files'}
                        </div>
                      );
                    }
                    return filtered.map((file, idx) => {
                      const fileName = file.split('/').pop() ?? file;
                      const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
                      return (
                        <button
                          key={file}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); selectAtFile(file); }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${idx === atMentionIndex ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5'}`}
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 opacity-50">
                            <rect x="1" y="2" width="10" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
                            <path d="M1 5h10" stroke="currentColor" strokeWidth="1.2" />
                          </svg>
                          <span className="font-medium">{fileName}</span>
                          {dir && <span className="ml-auto shrink-0 text-xs text-gray-400 dark:text-gray-500">{dir}</span>}
                        </button>
                      );
                    });
                  })()}
                </div>
              )}
              {pendingImage && (
                <div className="mb-2 flex items-center gap-2">
                  <img src={pendingImage} alt="Pending" className="h-14 rounded-lg border border-gray-200 dark:border-gray-700 object-cover" />
                  <button
                    onClick={() => setPendingImage(null)}
                    className="flex size-7 items-center justify-center rounded-full text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300"
                    aria-label="Remove image"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              )}

              <div
                suppressHydrationWarning
                className="flex items-end gap-2 rounded-2xl border border-gray-300 dark:border-gray-700 px-3 py-2.5 transition-shadow focus-within:border-gray-400 dark:focus-within:border-gray-500 focus-within:shadow-sm"
                style={{ backgroundColor: 'var(--bg-input)' }}
              >
                {/* Image attach */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800"
                  aria-label="Attach image"
                >
                  <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
                    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                    <circle cx="5.5" cy="6" r="1.25" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M1.5 11l3.5-3 2.5 2.5 2-2 4.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <input suppressHydrationWarning ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

                <textarea
                  suppressHydrationWarning
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={autoResize}
                  onKeyDown={handleKey}
                  onPaste={handlePaste}
                  placeholder="Describe a task for your agent…"
                  className="flex-1 resize-none bg-transparent py-1 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
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
              <p className="mt-1.5 hidden text-center text-xs text-gray-400 dark:text-gray-500 sm:block">
                Enter to send · Shift+Enter for new line · paste images · type @ to reference sandbox files
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
            className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-gray-700 p-7 shadow-2xl"
            style={{ backgroundColor: 'var(--bg)' }}
          >
            <h2 className="mb-1 text-base font-semibold text-gray-900 dark:text-gray-100">Connect GitHub</h2>
            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
              Authorize Ona to access your repositories.
            </p>

            {deviceAuth.status === 'error'
              ? (
                  <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-4 py-3">
                    <p className="text-sm text-red-700 dark:text-red-400">{deviceAuth.errorMsg ?? 'An error occurred.'}</p>
                  </div>
                )
              : (
                  <>
                    <p className="mb-2 text-center text-xs text-gray-500 dark:text-gray-400">
                      1. Go to
                      {' '}
                      <a href={deviceAuth.verification_uri} target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-600 dark:text-indigo-400 underline">
                        {deviceAuth.verification_uri}
                      </a>
                    </p>
                    <p className="mb-3 text-center text-xs text-gray-500 dark:text-gray-400">2. Enter this code:</p>
                    <div className="rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 px-4 py-3 text-center">
                      <span className="font-mono text-xl font-bold tracking-widest text-indigo-700 dark:text-indigo-300">
                        {deviceAuth.user_code}
                      </span>
                    </div>
                    <CopyDeviceCode code={deviceAuth.user_code} />
                    <div className="mt-3">
                      <CountdownTimer expiresAt={deviceAuth.expires_at} onExpired={() => setDeviceAuth(prev => prev ? { ...prev, status: 'error', errorMsg: 'Code expired. Please try again.' } : null)} />
                    </div>
                    <p className="mt-3 text-center text-xs text-gray-400 dark:text-gray-500">Waiting for authorization…</p>
                  </>
                )}

            <button
              onClick={cancelDeviceAuth}
              className="mt-5 w-full rounded-xl border border-gray-200 dark:border-gray-700 py-2.5 text-sm text-gray-600 dark:text-gray-400 transition-colors hover:border-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
