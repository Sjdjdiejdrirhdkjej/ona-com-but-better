'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GitHubConnect } from '@/components/GitHubConnect';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserDropdown } from '@/components/UserDropdown';

const AssistantMarkdownLazy = dynamic(() => import('@/components/AssistantMarkdown'), {
  ssr: false,
  loading: () => null,
});

const SERIF = 'Georgia, "Times New Roman", serif';
const APP_NAME = 'ONA but OPEN SOURCE';

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type SubStep = {
  label: string;
  status: 'running' | 'done' | 'error';
};

type TodoStatus = 'pending' | 'in_progress' | 'done';
type TodoItem = { id: string; task: string; status: TodoStatus };

type ToolStep = {
  label: string;
  status: 'running' | 'done' | 'error';
  subSteps?: SubStep[];
  librarianReport?: string;
  browserReport?: string;
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
          {isUser ? text : <AssistantMarkdownLazy text={text} />}
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
  const [expandedReports, setExpandedReports] = useState<Set<string>>(new Set());

  function toggleLabel(label: string) {
    setExpandedLabels(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function toggleReport(label: string) {
    setExpandedReports(prev => {
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
          const hasReport = !!step.librarianReport;
          const hasBrowserReport = !!step.browserReport;
          const isOpen = expandedLabels.has(step.label) || (step.status === 'running' && hasSubSteps);
          const isReportOpen = expandedReports.has(step.label);
          const isBrowserReportOpen = expandedReports.has(`${step.label}::browser`);
          return (
            <div key={i}>
              <div className="flex items-center gap-2 flex-wrap">
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
                {hasReport && (
                  <button
                    onClick={() => toggleReport(step.label)}
                    className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 2h7M1.5 5h7M1.5 8h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                    {isReportOpen ? 'Hide report' : 'View report'}
                  </button>
                )}
                {hasBrowserReport && (
                  <button
                    onClick={() => toggleReport(`${step.label}::browser`)}
                    className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <rect x="1" y="1.5" width="8" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
                      <path d="M1 3.5h8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                      <circle cx="2.5" cy="2.5" r="0.5" fill="currentColor" />
                      <circle cx="4" cy="2.5" r="0.5" fill="currentColor" />
                    </svg>
                    {isBrowserReportOpen ? 'Hide trace' : 'Browser trace'}
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
              {hasReport && isReportOpen && (
                <div className="mt-2 ml-4 rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/60 dark:bg-indigo-950/30 px-3 py-2.5 max-h-96 overflow-y-auto text-xs text-gray-700 dark:text-gray-300">
                  <AssistantMarkdownLazy text={step.librarianReport!} />
                </div>
              )}
              {hasBrowserReport && isBrowserReportOpen && (
                <div className="mt-2 ml-4 rounded-xl border border-sky-100 dark:border-sky-900/60 bg-sky-50/60 dark:bg-sky-950/30 px-3 py-2.5 max-h-96 overflow-y-auto text-xs text-gray-700 dark:text-gray-300">
                  <AssistantMarkdownLazy text={step.browserReport!} />
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

function TodoPanel({ todos, onDismiss }: { todos: TodoItem[]; onDismiss: () => void }) {
  if (todos.length === 0) return null;
  const allDone = todos.every(t => t.status === 'done');

  return (
    <div
      className="shrink-0 border-t border-gray-200 dark:border-gray-800 px-4 py-3 sm:px-8"
      style={{ backgroundColor: 'var(--bg)' }}
    >
      <div
        className="mx-auto max-w-2xl rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3"
        style={{ backgroundColor: 'var(--bg-card)' }}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {allDone
              ? (
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-emerald-500">
                    <circle cx="6.5" cy="6.5" r="6" stroke="currentColor" strokeWidth="1" />
                    <path d="M4 6.5l2 2 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )
              : (
                  <div className="size-3 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                )}
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {allDone ? 'All tasks complete' : `${todos.filter(t => t.status !== 'done').length} task${todos.filter(t => t.status !== 'done').length === 1 ? '' : 's'} remaining`}
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Dismiss"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <ul className="space-y-1">
          {todos.map(item => (
            <li key={item.id} className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0">
                {item.status === 'done' && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="6.5" fill="#22c55e" />
                    <path d="M4.5 7l2 2 3-3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {item.status === 'in_progress' && (
                  <div className="size-3.5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                )}
                {item.status === 'pending' && (
                  <div className="size-3.5 rounded-full border-2 border-gray-300 dark:border-gray-600" />
                )}
              </span>
              <span className={`text-xs leading-5 ${item.status === 'done' ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-700 dark:text-gray-300'}`}>
                {item.task}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function newConversation(): Conversation {
  return { id: crypto.randomUUID(), title: 'New task', messages: [], createdAt: Date.now() };
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-yellow-200 dark:bg-yellow-500/40 text-yellow-900 dark:text-yellow-200 px-0 not-italic font-semibold">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function getMatchSnippet(conv: Conversation, query: string): string | null {
  if (!query) return null;
  const q = query.toLowerCase();
  for (const m of conv.messages) {
    const raw = typeof m.content === 'string'
      ? m.content
      : Array.isArray(m.content)
        ? (m.content as { type?: string; text?: string }[])
            .filter(p => p.type === 'text')
            .map(p => p.text ?? '')
            .join(' ')
        : '';
    const lower = raw.toLowerCase();
    const idx = lower.indexOf(q);
    if (idx === -1) continue;
    const start = Math.max(0, idx - 30);
    const end = Math.min(raw.length, idx + query.length + 50);
    return (start > 0 ? '…' : '') + raw.slice(start, end) + (end < raw.length ? '…' : '');
  }
  return null;
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
  const [selectedModel, setSelectedModel] = useState<string>('ona-max-fast');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [atMention, setAtMention] = useState<{ query: string; caretPos: number } | null>(null);
  const [sandboxFiles, setSandboxFiles] = useState<string[]>([]);
  const [atMentionIndex, setAtMentionIndex] = useState(0);
  const [atMentionFetching, setAtMentionFetching] = useState(false);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const bgPollTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);
  const scrollRAFRef = useRef<number | null>(null);
  const userScrolledUpRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncedIds = useRef<Set<string>>(new Set());
  const sandboxFilesCacheRef = useRef<Map<string, string[]>>(new Map());
  const sessionIdRef = useRef<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Initialize a per-tab session ID from sessionStorage so concurrent tabs are isolated
  useEffect(() => {
    let sid = sessionStorage.getItem('ona_session_id');
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem('ona_session_id', sid);
    }
    sessionIdRef.current = sid;
  }, []);

  // Cmd/Ctrl+K → focus search
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (!sidebarOpen) setSidebarOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  // Load conversation history from DB on mount
  useEffect(() => {
    async function loadHistory() {
      // Wait a tick so sessionIdRef is populated by the effect above
      await new Promise(r => setTimeout(r, 0));
      const sid = sessionIdRef.current;
      try {
        const res = await fetch(`/api/conversations${sid ? `?sessionId=${sid}` : ''}`);
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
              scheduleBackgroundPoll(c.id, c.activeJobId, 0, true);
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

  function scheduleBackgroundPoll(convId: string, jobId: string, cursor: number, rebuild = false) {
    const existing = bgPollTimersRef.current.get(convId);
    if (existing) clearTimeout(existing);

    const delay = cursor === 0 && rebuild ? 0 : 3000;
    const timer = setTimeout(() => pollBackgroundJob(convId, jobId, cursor, rebuild), delay);
    bgPollTimersRef.current.set(convId, timer);
  }

  async function pollBackgroundJob(convId: string, jobId: string, cursor: number, rebuild = false) {
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

        // Handle todo_update events (outside setConversations since it's separate state)
        const lastTodoEvent = [...data.events].reverse().find(ev => ev.type === 'todo_update');
        if (lastTodoEvent && Array.isArray(lastTodoEvent.data.todos)) {
          setTodos(lastTodoEvent.data.todos as TodoItem[]);
        }

        setConversations(prev => {
          const conv = prev.find(c => c.id === convId);
          if (!conv) return prev;

          // Rebuild mode: strip all non-user messages and start fresh from events.
          // Used on page-refresh reconnect to avoid duplicating DB-loaded messages.
          let messages: Message[] = rebuild
            ? [
                ...conv.messages.filter(m => m.role === 'user'),
                { id: crypto.randomUUID(), role: 'assistant', content: '' },
              ]
            : [...conv.messages];

          function applyStepUpdate(
            msgs: Message[],
            predicate: (s: ToolStep) => boolean,
            updater: (s: ToolStep) => ToolStep,
          ): Message[] {
            let found = false;
            const updated = msgs.map(m => {
              if (m.role !== 'tool_steps' || found) return m;
              const steps = m.content as ToolStep[];
              if (steps.some(predicate)) {
                found = true;
                return { ...m, content: steps.map(s => predicate(s) ? updater(s) : s) };
              }
              return m;
            });
            return updated;
          }

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
              messages = applyStepUpdate(messages, s => s.label === tool, s => ({ ...s, status: 'running' as const }));
            } else if (ev.type === 'tool_complete') {
              const tool = ev.data.tool as string;
              const hasError = !!ev.data.error;
              messages = applyStepUpdate(messages, s => s.label === tool, s => ({ ...s, status: (hasError ? 'error' : 'done') as ToolStep['status'] }));
            } else if (ev.type === 'tool_done') {
              messages = messages.map(m =>
                m.role === 'tool_steps'
                  ? { ...m, content: (m.content as ToolStep[]).map(s => ({ ...s, status: s.status === 'running' ? 'done' as const : s.status })) }
                  : m,
              );
            } else if (ev.type === 'next_assistant_msg') {
              const nextAssistantMsgId = ev.data.nextAssistantMsgId as string ?? crypto.randomUUID();
              messages.push({ id: nextAssistantMsgId, role: 'assistant', content: '' });
            } else if (ev.type === 'librarian_step_start') {
              const parentLabel = ev.data.parentLabel as string;
              const step = ev.data.step as string;
              messages = applyStepUpdate(
                messages,
                s => s.label === parentLabel,
                s => ({ ...s, subSteps: [...(s.subSteps ?? []), { label: step, status: 'running' as const }] }),
              );
            } else if (ev.type === 'librarian_step_complete') {
              const parentLabel = ev.data.parentLabel as string;
              const step = ev.data.step as string;
              const hasError = !!ev.data.error;
              messages = applyStepUpdate(
                messages,
                s => s.label === parentLabel,
                s => ({
                  ...s,
                  subSteps: (s.subSteps ?? []).map(sub =>
                    sub.label === step ? { ...sub, status: (hasError ? 'error' : 'done') as SubStep['status'] } : sub,
                  ),
                }),
              );
            } else if (ev.type === 'librarian_report') {
              const parentLabel = ev.data.parentLabel as string;
              const report = ev.data.report as string;
              messages = applyStepUpdate(messages, s => s.label === parentLabel, s => ({ ...s, librarianReport: report }));
            } else if (ev.type === 'browser_use_step_start') {
              const parentLabel = ev.data.parentLabel as string;
              const step = ev.data.step as string;
              messages = applyStepUpdate(
                messages,
                s => s.label === parentLabel,
                s => ({ ...s, subSteps: [...(s.subSteps ?? []), { label: step, status: 'running' as const }] }),
              );
            } else if (ev.type === 'browser_use_step_complete') {
              const parentLabel = ev.data.parentLabel as string;
              const step = ev.data.step as string;
              const hasError = !!ev.data.error;
              messages = applyStepUpdate(
                messages,
                s => s.label === parentLabel,
                s => ({
                  ...s,
                  subSteps: (s.subSteps ?? []).map(sub =>
                    sub.label === step ? { ...sub, status: (hasError ? 'error' : 'done') as SubStep['status'] } : sub,
                  ),
                }),
              );
            } else if (ev.type === 'browser_use_report') {
              const parentLabel = ev.data.parentLabel as string;
              const report = ev.data.report as string;
              messages = applyStepUpdate(messages, s => s.label === parentLabel, s => ({ ...s, browserReport: report }));
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
          scheduleBackgroundPoll(convId, jobId, lastId, false);
        } else {
          stopBackgroundPoll(convId);
          refreshConversationMessages(convId);
        }
      } else {
        if (!data.done) {
          scheduleBackgroundPoll(convId, jobId, cursor, false);
        } else {
          stopBackgroundPoll(convId);
          refreshConversationMessages(convId);
        }
      }
    } catch {
      scheduleBackgroundPoll(convId, jobId, cursor, false);
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
      const sid = sessionIdRef.current;
      const res = await fetch(`/api/conversations${sid ? `?sessionId=${sid}` : ''}`);
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

  useEffect(() => { setTodos([]); }, [activeId]);

  // Scroll to bottom using double-RAF so both React's DOM commit and the
  // browser's subsequent layout/paint pass have completed before we read
  // scrollHeight. Single-RAF can fire before the browser reflows new content
  // (e.g. syntax-highlighted code blocks, tool-step expansions).
  const scrollToBottom = useCallback((force = false) => {
    if (!force && userScrolledUpRef.current) return;
    if (scrollRAFRef.current !== null) cancelAnimationFrame(scrollRAFRef.current);
    scrollRAFRef.current = requestAnimationFrame(() => {
      scrollRAFRef.current = requestAnimationFrame(() => {
        const el = scrollContainerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
        scrollRAFRef.current = null;
      });
    });
  }, []);

  // ResizeObserver on the messages content div: fires after every layout
  // change (new messages, tool blocks, markdown rendering, code highlighting)
  // so we never miss a content height change that should trigger a scroll.
  useEffect(() => {
    const content = messagesContentRef.current;
    if (!content) return;
    const ro = new ResizeObserver(() => {
      if (!userScrolledUpRef.current) {
        const el = scrollContainerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }
    });
    ro.observe(content);
    return () => ro.disconnect();
  });

  // Detect when the user manually scrolls up so we stop auto-scrolling.
  // Reset automatically when the user scrolls back to the bottom.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    function onScroll() {
      const distFromBottom = el!.scrollHeight - el!.scrollTop - el!.clientHeight;
      userScrolledUpRef.current = distFromBottom > 80;
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!modelMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [modelMenuOpen]);

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

  function startRenaming(id: string, currentTitle: string, e: React.MouseEvent) {
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(currentTitle);
    setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
  }

  async function commitRename(id: string) {
    const trimmed = renameValue.trim();
    setRenamingId(null);
    if (!trimmed) return;
    const conv = conversations.find(c => c.id === id);
    if (!conv || trimmed === conv.title) return;
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title: trimmed } : c));
    try {
      await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
    } catch {}
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue('');
  }

  const send = useCallback(async (text: string, imageDataUrl?: string) => {
    const trimmed = text.trim();
    if ((!trimmed && !imageDataUrl) || loading || !activeId) return;
    setTodos([]);

    const userContent: ContentPart[] = [];
    if (trimmed) userContent.push({ type: 'text', text: trimmed });
    if (imageDataUrl) userContent.push({ type: 'image_url', image_url: { url: imageDataUrl } });

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userContent.length === 1 && userContent[0]!.type === 'text' ? trimmed : userContent,
      imagePreview: imageDataUrl,
    };

    const currentConv = conversations.find(c => c.id === activeId);
    if (!currentConv) return;
    const isFirstMessage = currentConv.messages.length === 0;
    const title = trimmed
      ? (trimmed.length > 42 ? `${trimmed.slice(0, 42)}…` : trimmed)
      : 'Image task';

    setInput('');
    setPendingImage(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    userScrolledUpRef.current = false;
    scrollToBottom(true);
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
    const sessionId = sessionIdRef.current;
    if (!syncedIds.current.has(convId)) {
      try {
        await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: convId, title: convTitle, sessionId }),
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
    let currentJobId: string | null = null;
    let streamFinished = false;
    let keepBackgroundJob = false;
    const replayGeneratedMessageIds = new Set<string>([assistantId]);

    function prepareBackgroundReplay() {
      setConversations(prev => prev.map(c => {
        if (c.id !== convId) return c;
        return {
          ...c,
          messages: c.messages
            .filter(m => m.id === assistantId || !replayGeneratedMessageIds.has(m.id))
            .map(m => m.id === assistantId ? { ...m, content: '' } : m),
        };
      }));
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyMessages.map(m => ({ role: m.role, content: m.content })),
          conversationId: convId,
          assistantMessageId: assistantId,
          model: selectedModel,
        }),
        signal: abortController.signal,
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
          if (data === '[DONE]') {
            streamFinished = true;
            break;
          }
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
              report?: string;
              todos?: TodoItem[];
            };

            if (json.type === 'todo_update' && json.todos) {
              setTodos(json.todos);
            } else if (json.type === 'job_id' && json.jobId) {
              const jobId = json.jobId;
              currentJobId = jobId;
              setConversations(prev => prev.map(c =>
                c.id === convId ? { ...c, activeJobId: jobId } : c,
              ));
            } else if (json.type === 'next_assistant_msg' && json.nextAssistantMsgId) {
              currentAssistantId = json.nextAssistantMsgId;
              replayGeneratedMessageIds.add(json.nextAssistantMsgId);
              setConversations(prev => prev.map(c => {
                if (c.id !== convId) return c;
                return {
                  ...c,
                  messages: [...c.messages, { id: json.nextAssistantMsgId!, role: 'assistant', content: '' }],
                };
              }));
            } else if (json.type === 'tool_call' && json.tools?.length) {
              const toolStepsMsgId = json.toolStepsMsgId ?? crypto.randomUUID();
              const nextAssistantMsgId = json.nextAssistantMsgId ?? crypto.randomUUID();
              currentAssistantId = nextAssistantMsgId;
              replayGeneratedMessageIds.add(toolStepsMsgId);
              replayGeneratedMessageIds.add(nextAssistantMsgId);

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
            } else if (json.type === 'librarian_report' && json.parentLabel && json.report) {
              const { parentLabel, report } = json as { parentLabel: string; report: string };
              setConversations(prev => prev.map(c => {
                if (c.id !== convId) return c;
                return {
                  ...c,
                  messages: c.messages.map(m =>
                    m.role === 'tool_steps'
                      ? {
                          ...m,
                          content: (m.content as ToolStep[]).map(s =>
                            s.label === parentLabel ? { ...s, librarianReport: report } : s,
                          ),
                        }
                      : m,
                  ),
                };
              }));
            } else if (json.type === 'browser_use_step_start' && json.parentLabel && json.step) {
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
            } else if (json.type === 'browser_use_step_complete' && json.parentLabel && json.step) {
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
            } else if (json.type === 'browser_use_report' && json.parentLabel && json.report) {
              const { parentLabel, report } = json as { parentLabel: string; report: string };
              setConversations(prev => prev.map(c => {
                if (c.id !== convId) return c;
                return {
                  ...c,
                  messages: c.messages.map(m =>
                    m.role === 'tool_steps'
                      ? {
                          ...m,
                          content: (m.content as ToolStep[]).map(s =>
                            s.label === parentLabel ? { ...s, browserReport: report } : s,
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
        if (streamFinished) break;
      }
      streamFinished = true;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        keepBackgroundJob = !!currentJobId;
        if (currentJobId) {
          prepareBackgroundReplay();
          scheduleBackgroundPoll(convId, currentJobId, 0);
        }
      } else {
        const errText = `Something went wrong: ${(err as Error).message}`;
        keepBackgroundJob = !!currentJobId && !streamFinished;
        if (keepBackgroundJob && currentJobId) {
          prepareBackgroundReplay();
          scheduleBackgroundPoll(convId, currentJobId, 0);
        }
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
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
      if (streamFinished && !keepBackgroundJob) {
        setConversations(prev => prev.map(c =>
          c.id === convId ? { ...c, activeJobId: null } : c,
        ));
      }
    }
  }, [activeId, conversations, loading, selectedModel]);

  function stopGeneration() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
  }

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
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="w-full rounded-lg border border-black/8 dark:border-white/8 bg-white/60 dark:bg-white/5 py-1.5 pl-7 pr-12 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-gray-300 dark:focus:border-gray-600 focus:bg-white dark:focus:bg-white/8 transition-colors"
          />
          {search
            ? (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                  aria-label="Clear search"
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M1 1l9 9M10 1L1 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              )
            : (
                <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-0.5 rounded border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-1 py-0.5 font-mono text-[9px] text-gray-400 dark:text-gray-500 leading-none select-none">
                  ⌘K
                </kbd>
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
              return filtered.map((c) => {
                const snippet = q ? getMatchSnippet(c, q) : null;
                const titleMatchesQuery = q ? c.title.toLowerCase().includes(q) : false;
                const showSnippet = snippet && !titleMatchesQuery;
                return (
                  <div
                    key={c.id}
                    className={`group flex w-full items-stretch overflow-hidden rounded-xl text-left transition-colors ${
                      c.id === activeId
                        ? 'bg-black/8 dark:bg-white/10 text-gray-900 dark:text-gray-100'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/8 hover:text-gray-900 dark:hover:text-gray-100 active:bg-black/8 dark:active:bg-white/10'
                    }`}
                  >
                    <button
                      onClick={() => { if (renamingId !== c.id) { setActiveId(c.id); closeSidebarOnMobile(); } }}
                      onDoubleClick={e => syncedIds.current.has(c.id) && startRenaming(c.id, c.title, e)}
                      className="min-w-0 flex-1 px-3 py-3 text-left"
                      aria-label={`Switch to task: ${c.title}`}
                    >
                      <div className="flex items-center gap-1.5">
                        {renamingId === c.id
                          ? (
                              <input
                                ref={renameInputRef}
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { e.preventDefault(); commitRename(c.id); }
                                  if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                                }}
                                onBlur={() => commitRename(c.id)}
                                onClick={e => e.stopPropagation()}
                                className="w-full truncate rounded bg-white dark:bg-gray-800 border border-indigo-400 dark:border-indigo-500 px-1 py-0.5 text-sm font-medium text-gray-900 dark:text-gray-100 outline-none ring-2 ring-indigo-300/50 dark:ring-indigo-600/40"
                                aria-label="Rename conversation"
                              />
                            )
                          : (
                              <p className="truncate text-sm font-medium leading-tight">
                                <HighlightText text={c.title} query={q} />
                              </p>
                            )}
                        {!renamingId && c.activeJobId && (
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="shrink-0 text-indigo-400" style={{ animation: 'ona-spin 1s linear infinite' }}>
                            <circle cx="4" cy="4" r="3" stroke="currentColor" strokeWidth="1" strokeOpacity="0.25" />
                            <path d="M4 1A3 3 0 017 4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                          </svg>
                        )}
                      </div>
                      {renamingId !== c.id && (
                        showSnippet
                          ? (
                              <p className="mt-0.5 line-clamp-2 text-xs text-gray-400 dark:text-gray-500 leading-snug">
                                <HighlightText text={snippet} query={q} />
                              </p>
                            )
                          : (
                              <p suppressHydrationWarning className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{relativeTime(c.createdAt)}</p>
                            )
                      )}
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
                );
              });
            })()}
      </div>

      <div className="shrink-0 border-t border-black/8 dark:border-white/8 px-3 pb-3 pt-3 space-y-3">
        <GitHubConnect />
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
            {APP_NAME}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserDropdown />
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
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
            {isEmpty
              ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <h1
                      className="mb-3 text-2xl text-gray-900 dark:text-gray-100 sm:text-4xl"
                      style={{ fontFamily: SERIF, fontWeight: 400 }}
                    >
                      {`What should ${APP_NAME} do?`}
                    </h1>
                    <p className="mb-7 max-w-xs text-sm text-gray-500 dark:text-gray-400 sm:max-w-sm">
                      Connect GitHub, describe a task, and a background agent can inspect repos, create a branch, commit changes, and open a pull request.
                    </p>
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
                  <div ref={messagesContentRef} className="mx-auto max-w-2xl space-y-5">
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

          {/* ── Todo panel (ultrawork loop) ── */}
          <TodoPanel todos={todos} onDismiss={() => setTodos([])} />

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

              {/* Model selector */}
              {(() => {
                const MODEL_OPTIONS = [
                  { key: 'ona-max', label: 'ONA Max' },
                  { key: 'ona-max-fast', label: 'ONA Max Fast' },
                  { key: 'ona-mini', label: 'ONA Mini' },
                ] as const;
                const current = MODEL_OPTIONS.find(m => m.key === selectedModel) ?? MODEL_OPTIONS[1];
                return (
                  <div ref={modelMenuRef} className="relative mb-1.5 flex">
                    <button
                      type="button"
                      onClick={() => setModelMenuOpen(o => !o)}
                      className="flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-1 text-xs text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0 text-indigo-500">
                        <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M5 3v2.5L6.5 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      </svg>
                      {current.label}
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className={`shrink-0 transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`}>
                        <path d="M1.5 3L4 5.5L6.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {modelMenuOpen && (
                      <div className="absolute bottom-full left-0 mb-1.5 z-50 w-52 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden" style={{ backgroundColor: 'var(--bg-2)' }}>
                        {MODEL_OPTIONS.map(opt => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => { setSelectedModel(opt.key); setModelMenuOpen(false); }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${selectedModel === opt.key ? 'bg-gray-50 dark:bg-gray-800/60' : ''}`}
                          >
                            <span>
                              <span className="block text-xs font-medium text-gray-900 dark:text-gray-100">{opt.label}</span>
                            </span>
                            {selectedModel === opt.key && (
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-indigo-500">
                                <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div
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

                {/* Send / Stop */}
                {loading ? (
                  <button
                    onClick={stopGeneration}
                    aria-label="Stop"
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gray-950 text-white transition-opacity hover:opacity-80 active:opacity-70"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" />
                    </svg>
                  </button>
                ) : (
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
                )}
              </div>

              {/* Hint — desktop only */}
              <p className="mt-1.5 hidden text-center text-xs text-gray-400 dark:text-gray-500 sm:block">
                Enter to send · Shift+Enter for new line · paste images · type @ to reference sandbox files
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
