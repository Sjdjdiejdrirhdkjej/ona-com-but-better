'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GitHubConnect } from '@/components/GitHubConnect';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CreditsChip } from '@/components/CreditsChip';
import { UserDropdown } from '@/components/UserDropdown';
import { DEFAULT_SUPER_AGENT_HEARTBEAT_MINUTES, DEFAULT_SUPER_AGENT_MODEL, DEFAULT_SUPER_AGENT_PROMPT } from '@/libs/SuperAgent';
import { copyTextToClipboard, createBrowserId, observeElementSize } from '@/utils/browserCompat';

const AssistantMarkdownLazy = dynamic(() => import('@/components/AssistantMarkdown'), {
  ssr: false,
  loading: () => null,
});

const SERIF = 'Georgia, "Times New Roman", serif';
const APP_NAME = 'ONA but OPEN SOURCE';
const AUTONOMY_OPTIONS = [
  { key: 'ona-max', label: 'Hands on experience', description: 'Kimi K2.5 · fast, collaborative' },
  { key: 'ona-hands-off', label: 'Hands off experience', description: 'Qwen3 Coder 480B · agentic, 262K ctx' },
] as const;
const PROMPT_SUGGESTIONS = [
  { label: 'Backlog sweep', prompt: 'Inspect connected backlog items, identify one well-scoped engineering task, implement it in a branch, run checks, and prepare a pull request summary.' },
  { label: 'Bug triage', prompt: 'Investigate recent production bug reports or error context, reproduce the likely failure, fix it, and explain the validation steps.' },
  { label: 'Review PRs', prompt: 'Review my recent pull requests for bugs, security issues, and maintainability risks, then suggest concrete fixes.' },
  { label: 'Find CVEs', prompt: 'Find potential CVEs and dependency risks in a repository, apply safe updates, rerun the scan, and summarize remaining risk.' },
  { label: 'Docs drift', prompt: 'Compare recent code behavior with project documentation, update stale docs, and summarize what changed.' },
  { label: 'Dead code cleanup', prompt: 'Find unused dependencies, exports, and files, remove safe candidates, run checks, and prepare a reviewable change summary.' },
];

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type SubStep = {
  label: string;
  status: 'running' | 'done' | 'error';
  thinking?: string;
};

type TodoStatus = 'pending' | 'in_progress' | 'done';
type TodoItem = { id: string; task: string; status: TodoStatus };

type ToolStep = {
  label: string;
  status: 'running' | 'done' | 'error';
  subSteps?: SubStep[];
  traceKind?: 'oracle' | 'editor' | 'librarian' | 'tool';
  traceRequest?: string;
  librarianReport?: string;
  librarianThinking?: string[];
  browserReport?: string;
  oracleReport?: string;
  editorReport?: string;
  touchedFiles?: TouchedFileDiff[];
};

type TouchedFileDiff = {
  path: string;
  status: 'created' | 'modified' | 'deleted';
  diff: string;
  truncated?: boolean;
};

type Message = {
  id: string;
  role: 'user' | 'assistant' | 'tool_steps';
  content: string | ContentPart[] | ToolStep[];
  imagePreview?: string;
};

type SuperAgentConfig = {
  enabled: boolean;
  heartbeatMinutes: number;
  wakePrompt: string;
  model: string;
  nextHeartbeatAt: string | null;
  lastHeartbeatAt: string | null;
  lastRunStatus: string;
};

type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  activeJobId?: string | null;
  sandboxId?: string | null;
  superAgent?: SuperAgentConfig | null;
};



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
      className="mr-2.5 mt-1 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white dark:text-black"
      style={{ background: 'var(--bg-logo)' }}
    >
      O
    </div>
  );
}


function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const didCopy = await copyTextToClipboard(text);

    if (didCopy) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
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
      <div className={`space-y-2 ${isUser ? 'max-w-[85%] sm:max-w-[80%]' : 'min-w-0 flex-1'}`}>
        {msg.imagePreview && (
          <img
            src={msg.imagePreview}
            alt="Uploaded"
            className="max-h-48 w-full rounded-xl border border-gray-200 dark:border-gray-700 object-cover"
          />
        )}
        {isUser
          ? (
              <div className="min-w-0 rounded-3xl rounded-tr-md bg-gray-950 px-4 py-3 text-sm leading-relaxed text-white shadow-sm dark:bg-gray-100 dark:text-gray-950 whitespace-pre-wrap [overflow-wrap:anywhere]">
                {text}
              </div>
            )
          : (
              <div className="min-w-0 rounded-3xl rounded-tl-md border border-black/6 bg-white/70 px-4 py-3 text-sm leading-relaxed text-gray-800 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-gray-200 [overflow-wrap:anywhere]">
                <AssistantMarkdownLazy text={text} />
              </div>
            )}
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
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-indigo-400 animate-spin">
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

function DiffLine({ line }: { line: string }) {
  const tone = line.startsWith('+') && !line.startsWith('+++')
    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : line.startsWith('-') && !line.startsWith('---')
      ? 'bg-red-500/10 text-red-700 dark:text-red-300'
      : line.startsWith('@@')
        ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
        : 'text-gray-600 dark:text-gray-400';

  return (
    <div className={`whitespace-pre px-3 py-0.5 font-mono text-[11px] leading-5 ${tone}`}>
      {line || ' '}
    </div>
  );
}

function DiffPanel({ files }: { files: TouchedFileDiff[] }) {
  return (
    <div className="mt-2 ml-4 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950/40">
      <div className="border-b border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 dark:border-gray-800 dark:text-gray-300">
        Files changed
      </div>
      <div className="max-h-96 overflow-auto">
        {files.map(file => (
          <div key={`${file.path}:${file.status}`} className="border-b border-gray-200 last:border-b-0 dark:border-gray-800">
            <div className="flex items-center justify-between gap-3 bg-white/60 px-3 py-2 dark:bg-white/5">
              <span className="truncate font-mono text-xs text-gray-700 dark:text-gray-300">{file.path}</span>
              <span className="shrink-0 rounded-full border border-gray-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                {file.status}
              </span>
            </div>
            <div>
              {file.diff.split('\n').map((line, index) => (
                <DiffLine key={index} line={line} />
              ))}
            </div>
            {file.truncated && (
              <div className="px-3 py-2 text-[11px] text-gray-400 dark:text-gray-500">Diff truncated</div>
            )}
          </div>
        ))}
      </div>
    </div>
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
      <div className="min-w-0 flex-1 space-y-2 rounded-3xl rounded-tl-md border border-black/6 bg-white/70 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/5">
        {steps.map((step, i) => {
          const hasSubSteps = !!(step.subSteps && step.subSteps.length > 0);
          const hasTraceRequest = !!step.traceRequest;
          const hasReport = !!step.librarianReport;
          const hasBrowserReport = !!step.browserReport;
          const hasOracleReport = !!step.oracleReport;
          const hasEditorReport = !!step.editorReport;
          const hasDiff = !!(step.touchedFiles && step.touchedFiles.length > 0);
          const hasLibrarianThinking = !!(step.librarianThinking && step.librarianThinking.length > 0);
          const hasOracleSubStepThinking = !!(step.subSteps && step.subSteps.some(s => s.thinking));
          const isOpen = expandedLabels.has(step.label) || (step.status === 'running' && hasSubSteps);
          const isReportOpen = expandedReports.has(step.label);
          const isBrowserReportOpen = expandedReports.has(`${step.label}::browser`);
          const isOracleReportOpen = expandedReports.has(`${step.label}::oracle`);
          const isEditorReportOpen = expandedReports.has(`${step.label}::editor`);
          const isDiffOpen = expandedReports.has(`${step.label}::diff`);
          const isThinkingOpen = expandedReports.has(`${step.label}::thinking`);
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
                {hasDiff && (
                  <button
                    onClick={() => toggleReport(`${step.label}::diff`)}
                    className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-emerald-500 transition-colors hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 2.5h6M2 5h6M2 7.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                    {isDiffOpen ? 'Hide diff' : `${step.touchedFiles!.length} diff${step.touchedFiles!.length === 1 ? '' : 's'}`}
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
                {hasOracleReport && (
                  <button
                    onClick={() => toggleReport(`${step.label}::oracle`)}
                    className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2" />
                      <path d="M5 2.5v5M2.5 5h5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                    </svg>
                    {isOracleReportOpen ? 'Hide oracle' : 'Oracle report'}
                  </button>
                )}
                {hasEditorReport && (
                  <button
                    onClick={() => toggleReport(`${step.label}::editor`)}
                    className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 8l1.5-1.5 4-4L9 1 9 2.5 5 6.5 3.5 8H2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                    </svg>
                    {isEditorReportOpen ? 'Hide editor' : 'Editor report'}
                  </button>
                )}
                {(hasLibrarianThinking || hasOracleSubStepThinking) && (
                  <button
                    onClick={() => toggleReport(`${step.label}::thinking`)}
                    className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-teal-500 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M5 1.5a3 3 0 013 3c0 1.2-.7 2.2-1.7 2.7V8.5H3.7V7.2A3 3 0 015 1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                      <path d="M3.7 8.5h2.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                    </svg>
                    {isThinkingOpen ? 'Hide thinking' : 'Thinking'}
                  </button>
                )}
              </div>
              {hasSubSteps && isOpen && (
                <div className="mt-1.5 ml-4 pl-3 space-y-1.5 border-l border-gray-200 dark:border-gray-700">
                  {step.subSteps!.map((sub, j) => (
                    <div key={j}>
                      <div className="flex items-center gap-2">
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
                      {isThinkingOpen && sub.thinking && (
                        <div className="mt-1 ml-5 rounded-lg border border-teal-100 dark:border-teal-900/50 bg-teal-50/50 dark:bg-teal-950/20 px-2.5 py-2 max-h-48 overflow-y-auto">
                          <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.1em] text-teal-500 dark:text-teal-400">Reasoning</div>
                          <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-gray-600 dark:text-gray-300">{sub.thinking}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {hasLibrarianThinking && isThinkingOpen && (
                <div className="mt-2 ml-4 rounded-xl border border-teal-100 dark:border-teal-900/50 bg-teal-50/50 dark:bg-teal-950/20 px-3 py-2.5 max-h-72 overflow-y-auto">
                  <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-teal-500 dark:text-teal-400">Internal Reasoning</div>
                  {step.librarianThinking!.map((chunk, idx) => (
                    <div key={idx} className={idx > 0 ? 'mt-3 pt-3 border-t border-teal-100 dark:border-teal-900/40' : ''}>
                      {step.librarianThinking!.length > 1 && (
                        <div className="mb-1 text-[10px] text-teal-400 dark:text-teal-500">Pass {idx + 1}</div>
                      )}
                      <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-gray-600 dark:text-gray-300">{chunk}</pre>
                    </div>
                  ))}
                </div>
              )}
              {hasTraceRequest && (
                <div className="mt-2 ml-4 rounded-xl border border-gray-200/80 bg-gray-50/80 px-3 py-2.5 dark:border-gray-800 dark:bg-black/20">
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                    {step.traceKind === 'oracle'
                      ? 'Oracle Invocation'
                      : step.traceKind === 'editor'
                        ? 'Editor Invocation'
                        : step.traceKind === 'librarian'
                          ? 'Research Invocation'
                          : 'Invocation'}
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-gray-600 dark:text-gray-300">
                    {step.traceRequest}
                  </pre>
                </div>
              )}
              {hasReport && isReportOpen && (
                <div className="mt-2 ml-4 rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/60 dark:bg-indigo-950/30 px-3 py-2.5 max-h-96 overflow-y-auto text-xs text-gray-700 dark:text-gray-300">
                  <AssistantMarkdownLazy text={step.librarianReport!} />
                </div>
              )}
              {hasDiff && isDiffOpen && (
                <DiffPanel files={step.touchedFiles!} />
              )}
              {hasBrowserReport && isBrowserReportOpen && (
                <div className="mt-2 ml-4 rounded-xl border border-sky-100 dark:border-sky-900/60 bg-sky-50/60 dark:bg-sky-950/30 px-3 py-2.5 max-h-96 overflow-y-auto text-xs text-gray-700 dark:text-gray-300">
                  <AssistantMarkdownLazy text={step.browserReport!} />
                </div>
              )}
              {hasOracleReport && isOracleReportOpen && (
                <div className="mt-2 ml-4 rounded-xl border border-purple-100 dark:border-purple-900/60 bg-purple-50/60 dark:bg-purple-950/30 px-3 py-2.5 max-h-96 overflow-y-auto text-xs text-gray-700 dark:text-gray-300">
                  <AssistantMarkdownLazy text={step.oracleReport!} />
                </div>
              )}
              {hasEditorReport && isEditorReportOpen && (
                <div className="mt-2 ml-4 rounded-xl border border-amber-100 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/30 px-3 py-2.5 max-h-96 overflow-y-auto text-xs text-gray-700 dark:text-gray-300">
                  <AssistantMarkdownLazy text={step.editorReport!} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function parseToolSteps(tools: string[], rawToolTraces: unknown): ToolStep[] {
  if (Array.isArray(rawToolTraces)) {
    const normalized = rawToolTraces.flatMap((trace) => {
      if (!trace || typeof trace !== 'object') return [];
      const item = trace as Partial<ToolStep>;
      if (typeof item.label !== 'string') return [];

      return [{
        label: item.label,
        status: 'running' as const,
        traceKind: item.traceKind,
        traceRequest: typeof item.traceRequest === 'string' ? item.traceRequest : undefined,
      }];
    });

    if (normalized.length > 0) return normalized;
  }

  return tools.map(label => ({ label, status: 'running' as const }));
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <OnaAvatar />
      <div className="flex items-center gap-1.5 py-2">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-gray-400 animate-pulse"
            style={{ animationDelay: `${i * 0.2}s` }}
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
      <div className="flex items-center gap-2 py-2">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-indigo-400 animate-spin">
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" strokeOpacity="0.25" />
          <path d="M6 1.5A4.5 4.5 0 0110.5 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span className="text-xs text-indigo-500 dark:text-indigo-400">Working in background…</span>
      </div>
    </div>
  );
}

function SandboxBootingBanner() {
  return (
    <div className="flex justify-start">
      <OnaAvatar />
      <div className="flex items-center gap-2 py-2">
        <div className="size-3 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
        <span className="text-xs text-indigo-500 dark:text-indigo-400">Booting sandbox VM…</span>
      </div>
    </div>
  );
}

function SandboxToast({ sandboxId, onDismiss }: { sandboxId: string; onDismiss: () => void }) {
  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-gray-900 px-4 py-3 shadow-xl sm:left-auto sm:right-6 sm:bottom-6 sm:w-auto">
      <div className="flex items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-emerald-500">
            <circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1.1" />
            <path d="M3.5 6l1.8 1.8 3.2-3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Sandbox ready</span>
      </div>
      <Link
        href={`/sandbox-modify/${sandboxId}`}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80"
      >
        Modify VM
      </Link>
      <button
        onClick={onDismiss}
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        aria-label="Dismiss"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function TodoPanel({ todos, onDismiss }: { todos: TodoItem[]; onDismiss: () => void }) {
  if (todos.length === 0) return null;
  const allDone = todos.every(t => t.status === 'done');

  return (
    <div
      className="shrink-0 border-t border-black/6 px-4 py-3 dark:border-white/10 sm:px-8"
      style={{ backgroundColor: 'var(--bg)' }}
    >
      <div
        className="mx-auto max-w-3xl rounded-2xl border border-black/8 px-4 py-3 shadow-sm dark:border-white/10"
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
          {todos.map((item, index) => (
            <li key={`${item.id}:${index}`} className="flex items-start gap-2.5">
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
  return {
    id: createBrowserId(),
    title: 'New task',
    messages: [],
    createdAt: Date.now(),
    sandboxId: null,
    superAgent: {
      enabled: false,
      heartbeatMinutes: DEFAULT_SUPER_AGENT_HEARTBEAT_MINUTES,
      wakePrompt: DEFAULT_SUPER_AGENT_PROMPT,
      model: DEFAULT_SUPER_AGENT_MODEL,
      nextHeartbeatAt: null,
      lastHeartbeatAt: null,
      lastRunStatus: 'idle',
    },
  };
}

function uniqueMessages(messages: Message[]): Message[] {
  const seen = new Set<string>();
  return messages.filter((message) => {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  });
}

function uniqueConversations(conversations: Conversation[]): Conversation[] {
  const seen = new Set<string>();
  return conversations.filter((conversation) => {
    if (seen.has(conversation.id)) return false;
    seen.add(conversation.id);
    return true;
  });
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
  const [selectedModel, setSelectedModel] = useState<string>('ona-max');
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
  const [sandboxBooting, setSandboxBooting] = useState(false);
  const [initialSandboxGate, setInitialSandboxGate] = useState<{ conversationId: string } | null>(null);
  const [sandboxToastId, setSandboxToastId] = useState<string | null>(null);
  const [taskListOpen, setTaskListOpen] = useState(false);
  const [superAgentOpen, setSuperAgentOpen] = useState(false);
  const [superAgentSaving, setSuperAgentSaving] = useState(false);
  const [superAgentWaking, setSuperAgentWaking] = useState(false);
  const [superAgentEnabled, setSuperAgentEnabled] = useState(false);
  const [superAgentHeartbeat, setSuperAgentHeartbeat] = useState(String(DEFAULT_SUPER_AGENT_HEARTBEAT_MINUTES));
  const [superAgentPrompt, setSuperAgentPrompt] = useState(DEFAULT_SUPER_AGENT_PROMPT);
  const [superAgentModel, setSuperAgentModel] = useState(DEFAULT_SUPER_AGENT_MODEL);
  const [superAgentError, setSuperAgentError] = useState<string | null>(null);
  const [superAgentWakeSuccess, setSuperAgentWakeSuccess] = useState(false);
  const [superAgentUrlCopied, setSuperAgentUrlCopied] = useState(false);
  const bgPollTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Generation counter per conversation. Incremented by stopBackgroundPoll so
  // that any poll fetch already in-flight when polling is stopped can detect
  // the change on return and discard its results, preventing stale writes.
  const bgPollGenRef = useRef<Map<string, number>>(new Map());
  // Tracks consecutive 404 responses per jobId. After MAX_POLL_404S the job is
  // considered gone (server never created it or DB was wiped) and polling stops.
  const pollConsecutive404sRef = useRef<Map<string, number>>(new Map());
  const MAX_POLL_404S = 8;
  const abortControllerRef = useRef<AbortController | null>(null);
  // Tracks conversations where the SSE stream is confirmed to be delivering
  // events in real-time. Polling skips applying content/tool events for these
  // conversations to avoid doubling updates with the live SSE stream.
  const activeSseFetchRef = useRef<Set<string>>(new Set());
  const sseTimeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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
      sid = createBrowserId();
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

  // Cmd/Ctrl+1, +2 → switch autonomy level
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;
      if (e.key === '1') {
        e.preventDefault();
        setSelectedModel(AUTONOMY_OPTIONS[0].key as string);
      } else if (e.key === '2') {
        e.preventDefault();
        setSelectedModel(AUTONOMY_OPTIONS[1].key as string);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Cmd/Ctrl+Shift+S → open super agent modal
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.key !== 'S') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;
      e.preventDefault();
      if (!activeId || !syncedIds.current.has(activeId)) return;
      setSuperAgentOpen(o => {
        if (!o) {
          setSuperAgentError(null);
          setSuperAgentWakeSuccess(false);
        }
        return !o;
      });
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeId]);

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
          sandboxId: string | null;
          superAgent?: SuperAgentConfig | null;
          messages: Array<{ id: string; role: string; content: unknown }>;
        }>;

        if (data.length > 0) {
          const loaded: Conversation[] = uniqueConversations(data.map(c => ({
            id: c.id,
            title: c.title,
            createdAt: new Date(c.createdAt).getTime(),
            activeJobId: c.activeJobId,
            sandboxId: c.sandboxId,
            superAgent: c.superAgent ?? null,
            messages: uniqueMessages(c.messages.map(m => ({
              id: m.id,
              role: m.role as Message['role'],
              content: m.content as Message['content'],
            }))),
          })));
          loaded.forEach(c => syncedIds.current.add(c.id));
          setConversations(uniqueConversations([newConversation(), ...loaded]));

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
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeId]);

  function scheduleBackgroundPoll(convId: string, jobId: string, cursor: number, rebuild = false) {
    const existing = bgPollTimersRef.current.get(convId);
    if (existing) clearTimeout(existing);

    // Use 0ms for the very first poll (immediate), 1 500ms between subsequent
    // polls (fast enough for a good UX when SSE is buffered by the proxy).
    const delay = cursor === 0 ? 0 : 1500;
    const timer = setTimeout(() => pollBackgroundJob(convId, jobId, cursor, rebuild), delay);
    bgPollTimersRef.current.set(convId, timer);
  }

  async function pollBackgroundJob(convId: string, jobId: string, cursor: number, rebuild = false) {
    // Capture the generation before the async fetch so we can detect if
    // stopBackgroundPoll was called while the request was in-flight.
    const myGen = bgPollGenRef.current.get(convId) ?? 0;
    try {
      const res = await fetch(`/api/jobs/${jobId}/events?after=${cursor}`);
      // Discard results if polling was stopped (generation bumped) while fetching.
      if ((bgPollGenRef.current.get(convId) ?? 0) !== myGen) return;
      if (!res.ok) {
        if (res.status === 404) {
          // 404 means the job was never created (DB insert failed on the server
          // side or a stale in-memory activeJobId survived a page reload). After
          // MAX_POLL_404S consecutive misses we give up to avoid an infinite loop.
          const misses = (pollConsecutive404sRef.current.get(jobId) ?? 0) + 1;
          pollConsecutive404sRef.current.set(jobId, misses);
          if (misses >= MAX_POLL_404S) {
            pollConsecutive404sRef.current.delete(jobId);
            stopBackgroundPoll(convId);
            setLoading(false);
            setConversations(prev => prev.map(c =>
              c.id === convId ? { ...c, activeJobId: null } : c,
            ));
            return;
          }
        }
        // Transient non-OK: keep retrying (exponential-ish backoff via normal schedule).
        scheduleBackgroundPoll(convId, jobId, cursor, rebuild);
        return;
      }
      // Successful response — reset the 404 miss counter.
      pollConsecutive404sRef.current.delete(jobId);
      const data = await res.json() as {
        events: Array<{ id: number; type: string; data: Record<string, unknown> }>;
        done: boolean;
        status: string;
      };

      if (data.events.length > 0 || data.done) {
        const lastId = data.events.at(-1)?.id ?? cursor;

        // When SSE is confirmed to be streaming events in real-time for this
        // conversation, skip applying events to the UI here — SSE already did
        // it. We still need to advance the cursor so we don't reprocess stale
        // events once SSE ends and polling takes over fully.
        const sseActive = activeSseFetchRef.current.has(convId);

        if (data.done) {
          // Always handle job completion regardless of SSE status
          stopBackgroundPoll(convId);
          setLoading(false);
          setConversations(prev => prev.map(c =>
            c.id === convId ? { ...c, activeJobId: null } : c,
          ));
          refreshConversationMessages(convId);
          return;
        }

        if (sseActive) {
          // SSE is delivering — just advance cursor and re-schedule
          scheduleBackgroundPoll(convId, jobId, lastId, false);
          return;
        }

        // Handle todo_update events (outside setConversations since it's separate state)
        const lastTodoEvent = [...data.events].reverse().find(ev => ev.type === 'todo_update');
        if (lastTodoEvent && Array.isArray(lastTodoEvent.data.todos)) {
          setTodos(lastTodoEvent.data.todos as TodoItem[]);
        }

        const lastCreditEvent = [...data.events].reverse().find(ev => ev.type === 'credit_update');
        if (lastCreditEvent && typeof lastCreditEvent.data.credits === 'number') {
          window.dispatchEvent(new CustomEvent('credits-updated', { detail: { credits: lastCreditEvent.data.credits } }));
        }

        setConversations(prev => {
          const conv = prev.find(c => c.id === convId);
          if (!conv) return prev;

          // Rebuild mode: strip all non-user messages and start fresh from events.
          // Used on page-refresh reconnect to avoid duplicating DB-loaded messages.
          let messages: Message[] = rebuild
            ? [
                ...conv.messages.filter(m => m.role === 'user'),
                { id: createBrowserId(), role: 'assistant', content: '' },
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
              setInitialSandboxGate(waiting => waiting?.conversationId === convId ? null : waiting);
              const tools = (ev.data.tools as string[]) ?? [];
              const toolTraces = ev.data.toolTraces;
              const toolStepsMsgId = ev.data.toolStepsMsgId as string ?? createBrowserId();
              const nextAssistantMsgId = ev.data.nextAssistantMsgId as string ?? createBrowserId();
              messages = messages.filter(m => !(m.role === 'assistant' && m.content === ''));
              if (!messages.some(m => m.id === toolStepsMsgId)) {
                messages.push({ id: toolStepsMsgId, role: 'tool_steps', content: parseToolSteps(tools, toolTraces) });
              }
              if (!messages.some(m => m.id === nextAssistantMsgId)) {
                messages.push({ id: nextAssistantMsgId, role: 'assistant', content: '' });
              }
            } else if (ev.type === 'tool_start') {
              const tool = ev.data.tool as string;
              messages = applyStepUpdate(messages, s => s.label === tool, s => ({ ...s, status: 'running' as const }));
            } else if (ev.type === 'tool_complete') {
              const tool = ev.data.tool as string;
              const hasError = !!ev.data.error;
              const touchedFiles = Array.isArray(ev.data.touchedFiles) ? ev.data.touchedFiles as TouchedFileDiff[] : undefined;
              messages = applyStepUpdate(messages, s => s.label === tool, s => ({ ...s, status: (hasError ? 'error' : 'done') as ToolStep['status'], ...(touchedFiles ? { touchedFiles } : {}) }));
            } else if (ev.type === 'tool_done') {
              messages = messages.map(m =>
                m.role === 'tool_steps'
                  ? { ...m, content: (m.content as ToolStep[]).map(s => ({ ...s, status: s.status === 'running' ? 'done' as const : s.status })) }
                  : m,
              );
            } else if (ev.type === 'next_assistant_msg') {
              const nextAssistantMsgId = ev.data.nextAssistantMsgId as string ?? createBrowserId();
              if (!messages.some(m => m.id === nextAssistantMsgId)) {
                messages.push({ id: nextAssistantMsgId, role: 'assistant', content: '' });
              }
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
            } else if (ev.type === 'librarian_pro_step_start') {
              const parentLabel = ev.data.parentLabel as string;
              const step = ev.data.step as string;
              messages = applyStepUpdate(
                messages,
                s => s.label === parentLabel,
                s => ({ ...s, subSteps: [...(s.subSteps ?? []), { label: step, status: 'running' as const }] }),
              );
            } else if (ev.type === 'librarian_pro_step_complete') {
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
            } else if (ev.type === 'librarian_pro_thinking') {
              const parentLabel = ev.data.parentLabel as string;
              const thinking = ev.data.thinking as string;
              messages = applyStepUpdate(messages, s => s.label === parentLabel, s => ({
                ...s,
                librarianThinking: [...(s.librarianThinking ?? []), thinking],
              }));
            } else if (ev.type === 'librarian_pro_report') {
              const parentLabel = ev.data.parentLabel as string;
              const report = ev.data.report as string;
              messages = applyStepUpdate(messages, s => s.label === parentLabel, s => ({ ...s, librarianReport: report }));
            } else if (ev.type === 'editor_step_start') {
              const parentLabel = ev.data.parentLabel as string;
              const step = ev.data.step as string;
              messages = applyStepUpdate(
                messages,
                s => s.label === parentLabel,
                s => ({ ...s, subSteps: [...(s.subSteps ?? []), { label: step, status: 'running' as const }] }),
              );
            } else if (ev.type === 'editor_step_complete') {
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
            } else if (ev.type === 'editor_report') {
              const parentLabel = ev.data.parentLabel as string;
              const report = ev.data.report as string;
              messages = applyStepUpdate(messages, s => s.label === parentLabel, s => ({ ...s, editorReport: report }));
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
            } else if (ev.type === 'oracle_step_start') {
              const parentLabel = ev.data.parentLabel as string;
              const step = ev.data.step as string;
              messages = applyStepUpdate(
                messages,
                s => s.label === parentLabel,
                s => ({ ...s, subSteps: [...(s.subSteps ?? []), { label: step, status: 'running' as const }] }),
              );
            } else if (ev.type === 'oracle_step_complete') {
              const parentLabel = ev.data.parentLabel as string;
              const step = ev.data.step as string;
              const hasError = !!ev.data.error;
              const reasoning = typeof ev.data.reasoning === 'string' ? ev.data.reasoning : undefined;
              messages = applyStepUpdate(
                messages,
                s => s.label === parentLabel,
                s => ({
                  ...s,
                  subSteps: (s.subSteps ?? []).map(sub =>
                    sub.label === step
                      ? { ...sub, status: (hasError ? 'error' : 'done') as SubStep['status'], ...(reasoning ? { thinking: reasoning } : {}) }
                      : sub,
                  ),
                }),
              );
            } else if (ev.type === 'oracle_report') {
              const parentLabel = ev.data.parentLabel as string;
              const report = ev.data.report as string;
              messages = applyStepUpdate(messages, s => s.label === parentLabel, s => ({ ...s, oracleReport: report }));
            } else if (ev.type === 'sandbox_booting') {
              setSandboxBooting(true);
            } else if (ev.type === 'sandbox_ready') {
              setSandboxBooting(false);
              setInitialSandboxGate(waiting => waiting?.conversationId === convId ? null : waiting);
              const sandboxId = ev.data.sandbox_id as string | undefined;
              if (sandboxId) {
                setSandboxToastId(sandboxId);
                setConversations(prev => prev.map(c => c.id === convId ? { ...c, sandboxId } : c));
              }
            } else if (ev.type === 'content') {
              setInitialSandboxGate(waiting => waiting?.conversationId === convId ? null : waiting);
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

          return uniqueConversations(prev.map(c => c.id === convId ? { ...c, messages: uniqueMessages(messages) } : c));
        });

        scheduleBackgroundPoll(convId, jobId, lastId, false);
      } else {
        // No new events yet — keep polling
        scheduleBackgroundPoll(convId, jobId, cursor, false);
      }
    } catch {
      // Only reschedule if polling wasn't stopped while the request was in-flight.
      if ((bgPollGenRef.current.get(convId) ?? 0) === myGen) {
        scheduleBackgroundPoll(convId, jobId, cursor, false);
      }
    }
  }

  function stopBackgroundPoll(convId: string) {
    const timer = bgPollTimersRef.current.get(convId);
    if (timer) {
      clearTimeout(timer);
      bgPollTimersRef.current.delete(convId);
    }
    // Bump the generation so any in-flight poll fetch discards its results
    // instead of writing stale data on top of the already-correct state.
    bgPollGenRef.current.set(convId, (bgPollGenRef.current.get(convId) ?? 0) + 1);
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
        sandboxId?: string | null;
        superAgent?: SuperAgentConfig | null;
        messages: Array<{ id: string; role: string; content: unknown }>;
      }>;
      const found = data.find(c => c.id === convId);
      if (!found) return;
      setConversations(prev => prev.map(c =>
        c.id === convId
          ? {
              ...c,
              activeJobId: null,
              sandboxId: found.sandboxId ?? c.sandboxId,
              superAgent: found.superAgent ?? c.superAgent,
              messages: uniqueMessages(found.messages.map(m => ({
                id: m.id,
                role: m.role as Message['role'],
                content: m.content as Message['content'],
              }))),
            }
          : c,
      ));
    } catch {}
  }

  async function saveSuperAgentSettings() {
    if (!activeId) return;
    const heartbeatMinutes = Math.max(1, Number.parseInt(superAgentHeartbeat, 10) || DEFAULT_SUPER_AGENT_HEARTBEAT_MINUTES);

    setSuperAgentError(null);
    setSuperAgentSaving(true);
    try {
      const res = await fetch(`/api/conversations/${activeId}/super-agent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: superAgentEnabled,
          heartbeatMinutes,
          wakePrompt: superAgentPrompt.trim() || DEFAULT_SUPER_AGENT_PROMPT,
          model: superAgentModel,
        }),
      });
      if (!res.ok) throw new Error('Failed to save super agent settings');
      const config = await res.json() as SuperAgentConfig;
      setConversations(prev => prev.map(c => (
        c.id === activeId
          ? { ...c, superAgent: config }
          : c
      )));
      setSuperAgentOpen(false);
    } catch {
      setSuperAgentError('Could not save settings. Please try again.');
    } finally {
      setSuperAgentSaving(false);
    }
  }

  async function wakeSuperAgentNow() {
    if (!activeId) return;
    setSuperAgentError(null);
    setSuperAgentWakeSuccess(false);
    setSuperAgentWaking(true);
    try {
      const res = await fetch('/api/super-agent/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeId, force: true }),
      });
      if (!res.ok) throw new Error('Failed to wake super agent');

      const payload = await res.json() as { results?: Array<{ jobId?: string; status?: string }> };
      const jobId = payload.results?.[0]?.jobId;
      if (jobId) {
        setLoading(false);
        setConversations(prev => prev.map(c =>
          c.id === activeId ? { ...c, activeJobId: jobId } : c,
        ));
        scheduleBackgroundPoll(activeId, jobId, 0, false);
        setSuperAgentWakeSuccess(true);
        setTimeout(() => {
          setSuperAgentOpen(false);
          setSuperAgentWakeSuccess(false);
        }, 1200);
      } else {
        setSuperAgentWakeSuccess(true);
        setTimeout(() => {
          setSuperAgentOpen(false);
          setSuperAgentWakeSuccess(false);
        }, 1200);
      }
    } catch {
      setSuperAgentError('Could not wake the super agent. Please try again.');
    } finally {
      setSuperAgentWaking(false);
    }
  }

  // Detect mobile vs desktop and set sidebar default
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(!e.matches);
      setSidebarOpen(false);
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
    if (!initialSandboxGate || loading) return;
    const gatedConversation = conversations.find(c => c.id === initialSandboxGate.conversationId);
    if (!gatedConversation?.activeJobId) {
      setInitialSandboxGate(null);
      setSandboxBooting(false);
    }
  }, [conversations, initialSandboxGate, loading]);

  useEffect(() => {
    if (!activeId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('c', activeId);
    window.history.replaceState(null, '', url.toString());
  }, [activeId]);

  const activeConversation = conversations.find(c => c.id === activeId);
  const messages = activeConversation?.messages ?? [];
  const activeSandboxId = activeConversation?.sandboxId;
  const canConfigureSuperAgent = !!activeId && syncedIds.current.has(activeId);

  useEffect(() => { setTodos([]); }, [activeId]);

  useEffect(() => {
    const config = activeConversation?.superAgent;
    if (!config) {
      setSuperAgentEnabled(false);
      setSuperAgentHeartbeat(String(DEFAULT_SUPER_AGENT_HEARTBEAT_MINUTES));
      setSuperAgentPrompt(DEFAULT_SUPER_AGENT_PROMPT);
      setSuperAgentModel(DEFAULT_SUPER_AGENT_MODEL);
      return;
    }

    setSuperAgentEnabled(config.enabled);
    setSuperAgentHeartbeat(String(config.heartbeatMinutes));
    setSuperAgentPrompt(config.wakePrompt);
    setSuperAgentModel(config.model);
  }, [activeConversation?.id, activeConversation?.superAgent]);

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
    return observeElementSize(content, () => {
      if (!userScrolledUpRef.current) {
        const el = scrollContainerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }
    });
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
    setSidebarOpen(false);
  }

  function useSuggestion(prompt: string) {
    setInput(prompt);
    setTimeout(() => {
      textareaRef.current?.focus();
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
      }
    }, 0);
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
      return uniqueConversations(next);
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
      id: createBrowserId(),
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

    const assistantId = createBrowserId();
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
    if (isFirstMessage) {
      setInitialSandboxGate({ conversationId: activeId });
    }

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
    // Generate the job ID client-side so we can start polling immediately,
    // before the SSE stream delivers the first event. The server will use
    // this ID so polling and SSE refer to the same job.
    const pregenJobId = createBrowserId();
    let currentJobId: string = pregenJobId;
    let streamFinished = false;
    let keepBackgroundJob = false;
    const replayGeneratedMessageIds = new Set<string>([assistantId]);
    // True once SSE starts delivering text deltas — used to skip duplicate
    // content that already arrived via SSE when processing polling events.
    let sseDeliveredContent = false;

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

    // Register the job ID in the conversation so the header/badge shows "working"
    setConversations(prev => prev.map(c =>
      c.id === convId ? { ...c, activeJobId: pregenJobId } : c,
    ));

    // Start polling immediately — this is the primary update path when the
    // Replit proxy buffers the SSE stream. Polling will show progress every
    // ~1.5 s even if SSE events never arrive during the request.
    scheduleBackgroundPoll(convId, pregenJobId, 0, false);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Mark this conversation as having an active SSE fetch so pollBackgroundJob
    // knows to skip applying events that SSE will deliver in real-time.
    // If no SSE delta arrives within 3 seconds, we assume the proxy is
    // buffering. We then ABORT the SSE connection so polling becomes the sole
    // writer — preventing SSE from later appending buffered content on top of
    // what polling already wrote (which would cause visible message duplication).
    activeSseFetchRef.current.add(convId);
    const sseActivityTimeout = setTimeout(() => {
      activeSseFetchRef.current.delete(convId);
      sseTimeoutRef.current.delete(convId);
      // Close the SSE stream — polling takes over exclusively from here.
      abortController.abort();
    }, 3000);
    sseTimeoutRef.current.set(convId, sseActivityTimeout);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyMessages.map(m => ({ role: m.role, content: m.content })),
          conversationId: convId,
          assistantMessageId: assistantId,
          jobId: pregenJobId,
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
              sandbox_id?: string;
              touchedFiles?: TouchedFileDiff[];
              credits?: number;
            };

            if (json.type === 'todo_update' && json.todos) {
              setTodos(json.todos);
            } else if (json.type === 'credit_update' && typeof json.credits === 'number') {
              window.dispatchEvent(new CustomEvent('credits-updated', { detail: { credits: json.credits } }));
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
                if (c.messages.some(m => m.id === json.nextAssistantMsgId)) return c;
                return {
                  ...c,
                  messages: [...c.messages, { id: json.nextAssistantMsgId!, role: 'assistant', content: '' }],
                };
              }));
            } else if (json.type === 'tool_call' && json.tools?.length) {
              setInitialSandboxGate(waiting => waiting?.conversationId === convId ? null : waiting);
              const toolTraces = (json as { toolTraces?: unknown }).toolTraces;
              const toolStepsMsgId = json.toolStepsMsgId ?? createBrowserId();
              const nextAssistantMsgId = json.nextAssistantMsgId ?? createBrowserId();
              currentAssistantId = nextAssistantMsgId;
              replayGeneratedMessageIds.add(toolStepsMsgId);
              replayGeneratedMessageIds.add(nextAssistantMsgId);

              setConversations(prev => prev.map(c => {
                if (c.id !== convId) return c;
                if (c.messages.some(m => m.id === toolStepsMsgId || m.id === nextAssistantMsgId)) return c;
                const newSteps: Message = {
                  id: toolStepsMsgId,
                  role: 'tool_steps',
                  content: parseToolSteps(json.tools as string[], toolTraces),
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
                              ? { ...s, status: (hasError ? 'error' : 'done') as ToolStep['status'], ...(json.touchedFiles ? { touchedFiles: json.touchedFiles } : {}) }
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
            } else if (json.type === 'librarian_pro_step_start' && json.parentLabel && json.step) {
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
            } else if (json.type === 'librarian_pro_step_complete' && json.parentLabel && json.step) {
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
            } else if (json.type === 'librarian_pro_thinking' && json.parentLabel && json.thinking) {
              const { parentLabel, thinking } = json as { parentLabel: string; thinking: string };
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
                              ? { ...s, librarianThinking: [...(s.librarianThinking ?? []), thinking] }
                              : s,
                          ),
                        }
                      : m,
                  ),
                };
              }));
            } else if (json.type === 'librarian_pro_report' && json.parentLabel && json.report) {
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
            } else if (json.type === 'editor_step_start' && json.parentLabel && json.step) {
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
            } else if (json.type === 'editor_step_complete' && json.parentLabel && json.step) {
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
            } else if (json.type === 'editor_report' && json.parentLabel && json.report) {
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
                            s.label === parentLabel ? { ...s, editorReport: report } : s,
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
            } else if (json.type === 'oracle_step_start' && json.parentLabel && json.step) {
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
            } else if (json.type === 'oracle_step_complete' && json.parentLabel && json.step) {
              const { parentLabel, step, error: hasError, reasoning } = json as { parentLabel: string; step: string; error?: boolean; reasoning?: string };
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
                                      ? { ...sub, status: (hasError ? 'error' : 'done') as SubStep['status'], ...(reasoning ? { thinking: reasoning } : {}) }
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
            } else if (json.type === 'oracle_report' && json.parentLabel && json.report) {
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
                            s.label === parentLabel ? { ...s, oracleReport: report } : s,
                          ),
                        }
                      : m,
                  ),
                };
              }));
            } else if (json.type === 'sandbox_booting') {
              setSandboxBooting(true);
            } else if (json.type === 'sandbox_ready') {
              setSandboxBooting(false);
              setInitialSandboxGate(waiting => waiting?.conversationId === convId ? null : waiting);
              if (json.sandbox_id) {
                setSandboxToastId(json.sandbox_id);
                setConversations(prev => prev.map(c => c.id === convId ? { ...c, sandboxId: json.sandbox_id! } : c));
              }
            } else if (json.type === 'error' && json.message) {
              setInitialSandboxGate(waiting => waiting?.conversationId === convId ? null : waiting);
              throw new Error(json.message);
            } else if (json.delta) {
              setInitialSandboxGate(waiting => waiting?.conversationId === convId ? null : waiting);
              const delta = json.delta;
              if (!sseDeliveredContent) {
                // First delta proves SSE is not buffered. Cancel the timeout that
                // would have handed control back to polling, so polling keeps
                // deferring to SSE for the rest of this request.
                const t = sseTimeoutRef.current.get(convId);
                if (t) {
                  clearTimeout(t);
                  sseTimeoutRef.current.delete(convId);
                }
              }
              sseDeliveredContent = true;
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
        // SSE was aborted — polling (already running) will continue delivering updates
        keepBackgroundJob = true;
      } else {
        const errText = `Something went wrong: ${(err as Error).message}`;
        // If we never got any content at all via SSE, show the error in the message bubble.
        // If polling is already delivering content, leave it alone.
        if (!sseDeliveredContent) {
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
        keepBackgroundJob = true;
      }
    } finally {
      abortControllerRef.current = null;
      // Always unmark SSE as active for this conversation and cancel the
      // timeout — either SSE finished naturally or it errored/aborted.
      activeSseFetchRef.current.delete(convId);
      const t = sseTimeoutRef.current.get(convId);
      if (t) {
        clearTimeout(t);
        sseTimeoutRef.current.delete(convId);
      }
      setSandboxBooting(false);
      setInitialSandboxGate(waiting => waiting?.conversationId === convId ? null : waiting);
      // Polling owns the loading state and will call setLoading(false) when
      // it sees the "done" event. But if SSE finished cleanly AND streaming
      // ended with a [DONE] marker, stop polling ourselves right away.
      if (streamFinished && !keepBackgroundJob) {
        stopBackgroundPoll(convId);
        setLoading(false);
        setConversations(prev => prev.map(c =>
          c.id === convId ? { ...c, activeJobId: null } : c,
        ));
        refreshConversationMessages(convId);
      }
    }
  }, [activeId, conversations, loading, selectedModel]);

  function stopGeneration() {
    setSandboxBooting(false);
    setInitialSandboxGate(null);
    // Abort the SSE fetch (if still in progress)
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    // Stop background polling for the active conversation
    if (activeId) {
      stopBackgroundPoll(activeId);
      // Clear the SSE-active marker and any pending timeout
      activeSseFetchRef.current.delete(activeId);
      const t = sseTimeoutRef.current.get(activeId);
      if (t) {
        clearTimeout(t);
        sseTimeoutRef.current.delete(activeId);
      }
      setConversations(prev => prev.map(c =>
        c.id === activeId ? { ...c, activeJobId: null } : c,
      ));
    }
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
  const waitingForInitialSandbox = initialSandboxGate?.conversationId === activeId;
  const showEmptyPrompt = isEmpty || waitingForInitialSandbox;
  const canSend = !!(input.trim() || pendingImage) && !loading && !waitingForInitialSandbox;
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
                    key={`${c.id}:sidebar`}
                    className={`group flex w-full items-stretch overflow-hidden rounded-xl text-left transition-colors ${
                      c.id === activeId
                        ? 'bg-black/8 dark:bg-white/10 text-gray-900 dark:text-gray-100'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/8 hover:text-gray-900 dark:hover:text-gray-100 active:bg-black/8 dark:active:bg-white/10'
                    }`}
                  >
                    <button
                      onClick={() => { if (renamingId !== c.id) { setActiveId(c.id); setSidebarOpen(false); } }}
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
                            <circle cx="4" cy="4" r="3.5" stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" />
                            <path d="M4 0.5A3.5 3.5 0 017.5 4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
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

      <div className="shrink-0 border-t border-black/8 px-3 pb-3 pt-3 dark:border-white/8">
        <p className="text-xs text-gray-400 dark:text-gray-500">GitHub connection, theme, and new task controls are available in the top bar.</p>
      </div>
    </>
  );

  return (
    <div className="flex flex-col overflow-hidden text-gray-950 dark:text-gray-50" style={{ backgroundColor: 'var(--bg)', height: '100dvh' }}>
      {/* ── Header ── */}
      <header
        className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-black/6 px-2.5 text-xs dark:border-white/8 sm:h-10 sm:px-5"
        style={{ backgroundColor: 'var(--bg-header)', backdropFilter: 'blur(14px)' }}
      >
        <Link href="/" className="flex min-w-0 shrink-0 basis-0 grow items-center gap-1.5 truncate font-semibold tracking-tight text-gray-950 dark:text-gray-50 sm:mr-2 sm:gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-gray-950 text-[10px] text-white dark:bg-gray-100 dark:text-gray-950">O</span>
          <span className="hidden sm:inline">{APP_NAME}</span>
          <span className="sm:hidden">ONA</span>
        </Link>
        <nav className="hidden shrink-0 items-center gap-6 text-[11px] text-gray-500 dark:text-gray-400 md:flex">
          <Link href="/app" className="transition-colors hover:text-gray-950 dark:hover:text-gray-100">Tasks</Link>
          <button type="button" onClick={() => setSidebarOpen(true)} className="transition-colors hover:text-gray-950 dark:hover:text-gray-100">History</button>
          <Link href="/" className="transition-colors hover:text-gray-950 dark:hover:text-gray-100">Home</Link>
        </nav>
        <div className="flex min-w-0 shrink-0 basis-0 grow items-center justify-end gap-0.5 sm:gap-2">
          <GitHubConnect />
          <div
            title={`Autonomy: ${AUTONOMY_OPTIONS.find(o => o.key === selectedModel)?.label ?? 'Hands on experience'} · Switch: ⌘1 Hands on · ⌘2 Hands off`}
            className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:flex ${
              selectedModel === 'ona-hands-off'
                ? 'border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-400'
                : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
            }`}
          >
            <span className={`size-1.5 shrink-0 rounded-full ${selectedModel === 'ona-hands-off' ? 'bg-indigo-400 dark:bg-indigo-500' : 'bg-amber-400 dark:bg-amber-500'}`} />
            <span>{selectedModel === 'ona-hands-off' ? 'Hands off' : 'Hands on'}</span>
          </div>
          <button
            type="button"
            onClick={() => { setSuperAgentOpen(true); setSuperAgentError(null); setSuperAgentWakeSuccess(false); }}
            disabled={!canConfigureSuperAgent}
            className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:flex sm:px-3 ${
              activeConversation?.superAgent?.enabled
                ? 'border-emerald-200 text-emerald-700 hover:border-emerald-400 dark:border-emerald-900 dark:text-emerald-300 dark:hover:border-emerald-700'
                : 'border-gray-200 text-gray-600 hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-100'
            }`}
            style={{ backgroundColor: 'var(--bg-card)' }}
            title={canConfigureSuperAgent ? 'Configure super agent (⌘⇧S)' : 'Send the first task to save this conversation before enabling the super agent'}
          >
            <span className={`size-1.5 shrink-0 rounded-full ${activeConversation?.superAgent?.enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
            <span>Super agent</span>
          </button>
          {activeSandboxId
            ? (
                <Link
                  href={`/sandbox-modify/${activeSandboxId}`}
                  className="hidden items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-100 sm:flex sm:px-3"
                  style={{ backgroundColor: 'var(--bg-card)' }}
                  title="Modify VM"
                >
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <rect x="2" y="3" width="10" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M5 12h4M7 10.5V12M4.5 6h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  <span className="hidden sm:inline">Modify VM</span>
                </Link>
              )
            : (
                <button
                  type="button"
                  disabled
                  className="hidden items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-400 opacity-60 dark:border-gray-700 dark:text-gray-500 sm:flex sm:px-3"
                  style={{ backgroundColor: 'var(--bg-card)' }}
                  title="Start a task to create a VM before modifying it"
                >
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <rect x="2" y="3" width="10" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M5 12h4M7 10.5V12M4.5 6h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  <span className="hidden sm:inline">Modify VM</span>
                </button>
              )}
          <span className="hidden sm:contents">
            <ThemeToggle />
            <CreditsChip />
          </span>
          <UserDropdown />
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="flex size-10 items-center justify-center rounded-full text-xs text-gray-600 transition-colors hover:bg-black/5 hover:text-gray-950 dark:text-gray-400 dark:hover:bg-white/8 dark:hover:text-gray-100 sm:size-auto sm:gap-1.5 sm:px-2.5 sm:py-1.5"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3 3h8M3 7h8M3 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="hidden sm:inline">History</span>
          </button>
          <button
            onClick={createNewChat}
            className="flex size-10 items-center justify-center rounded-full bg-gray-950 text-xs font-medium text-white transition-opacity hover:opacity-85 active:opacity-75 dark:bg-gray-100 dark:text-gray-950 sm:size-auto sm:gap-1.5 sm:px-3 sm:py-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="hidden sm:inline">New task</span>
          </button>
        </div>
      </header>
      <div className="hidden sm:block shrink-0 truncate border-b border-black/5 px-3 py-1.5 text-center text-[11px] text-gray-500 dark:border-white/8 dark:text-gray-400">
        ONA runs background tasks in isolated VMs, keeps audit-ready progress, and lets you take over when needed.
      </div>

      {/* ── Body ── */}
      <div className="relative flex min-h-0 flex-1">

        {/* ── Chat area ── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Messages / empty state */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 py-4 sm:px-8 sm:py-6">
            {showEmptyPrompt
              ? (
                  <div key={activeId} className="flex min-h-full flex-col items-center justify-center px-0 py-4 sm:px-8 sm:py-8">
                    <h1
                      className="mb-5 max-w-xl text-center text-2xl leading-tight text-gray-900 dark:text-gray-100 sm:mb-6 sm:text-4xl"
                      style={{ fontFamily: SERIF, fontWeight: 400 }}
                    >
                      What should Ona ship?
                    </h1>
                    <div className="relative w-full max-w-2xl">
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
                      {/* Autonomy level selector */}
                      {(() => {
                        const current = AUTONOMY_OPTIONS.find(m => m.key === selectedModel) ?? AUTONOMY_OPTIONS[0];
                        return (
                          <div ref={modelMenuRef} className="relative mb-2 flex justify-center sm:justify-start">
                            <button
                              type="button"
                              onClick={() => setModelMenuOpen(o => !o)}
                              className="flex items-center gap-1.5 rounded-full border border-black/8 bg-white/80 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:border-black/20 hover:text-gray-900 dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:hover:border-white/20 dark:hover:text-gray-200"
                            >
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0 text-indigo-500">
                                <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.4" />
                                <path d="M3 5h4M5 3v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                              </svg>
                              <span className="hidden sm:inline text-gray-400 dark:text-gray-500">Autonomy level:</span>
                              {current.label}
                              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className={`shrink-0 transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`}>
                                <path d="M1.5 3L4 5.5L6.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                            {modelMenuOpen && (
                              <div className="absolute bottom-full left-0 mb-1.5 z-50 w-56 overflow-hidden rounded-2xl border border-black/8 shadow-lg dark:border-white/10" style={{ backgroundColor: 'var(--bg-card)' }}>
                                <div className="px-3 py-2 border-b border-black/6 dark:border-white/8">
                                  <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">Autonomy level</span>
                                </div>
                                {AUTONOMY_OPTIONS.map(opt => (
                                  <button
                                    key={opt.key}
                                    type="button"
                                    onClick={() => { setSelectedModel(opt.key); setModelMenuOpen(false); }}
                                    className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/8 ${selectedModel === opt.key ? 'bg-black/5 dark:bg-white/8' : ''}`}
                                  >
                                    <span>
                                      <span className="block text-xs font-medium text-gray-900 dark:text-gray-100">{opt.label}</span>
                                      <span className="block text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{opt.description}</span>
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
                        className="flex min-h-24 items-end gap-2 rounded-[1.5rem] border border-black/10 px-3 py-3 shadow-sm transition-shadow focus-within:border-black/20 focus-within:shadow-md dark:border-white/10 dark:focus-within:border-white/20 sm:min-h-32 sm:gap-3 sm:rounded-[1.75rem] sm:px-4 sm:py-4"
                        style={{ backgroundColor: 'var(--bg-input)' }}
                      >
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex size-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-700 active:bg-black/8 dark:text-gray-500 dark:hover:bg-white/8 dark:hover:text-gray-300 sm:size-10"
                          aria-label="Attach image"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M8 3.25v9.5M3.25 8h9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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
                          placeholder="Assign a task or ask anything"
                          className="min-h-[4rem] flex-1 resize-none bg-transparent py-1.5 text-base text-gray-900 outline-none placeholder-gray-400 dark:text-gray-100 dark:placeholder-gray-500 sm:min-h-28 sm:py-2"
                          style={{ maxHeight: '180px' }}
                        />
                        {waitingForInitialSandbox ? (
                          <button
                            type="button"
                            disabled
                            aria-label="Booting Daytona VM"
                            className="flex size-10 shrink-0 cursor-not-allowed items-center justify-center rounded-full bg-gray-950 text-white opacity-80"
                          >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="animate-spin">
                              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
                              <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          </button>
                        ) : loading ? (
                          <button
                            onClick={stopGeneration}
                            aria-label="Stop"
                            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gray-950 text-white transition-opacity hover:opacity-80 active:opacity-70"
                          >
                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                              <rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" />
                            </svg>
                          </button>
                        ) : (
                          <button
                            onClick={() => send(input, pendingImage ?? undefined)}
                            disabled={!canSend}
                            aria-label="Send"
                            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gray-950 text-white transition-opacity hover:opacity-80 disabled:opacity-25 active:opacity-70"
                          >
                            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                              <path d="M7 12V2M7 2L3 6M7 2L11 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <div className="-mx-3 mt-4 flex max-w-[100vw] snap-x items-center gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:pb-0">
                        {PROMPT_SUGGESTIONS.map(suggestion => (
                          <button
                            key={suggestion.label}
                            type="button"
                            onClick={() => useSuggestion(suggestion.prompt)}
                            className="shrink-0 snap-start rounded-full border border-black/8 bg-white/70 px-3 py-1.5 text-xs text-gray-600 shadow-sm transition-colors hover:border-black/20 hover:text-gray-950 dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:hover:border-white/20 dark:hover:text-gray-100"
                          >
                            {suggestion.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-3 hidden text-center text-xs text-gray-400 dark:text-gray-500 sm:block">
                        Enter to send · Shift+Enter for new line · paste images · type @ to reference sandbox files
                      </p>
                    </div>
                  </div>
                )
              : (
                  <div key={activeId} ref={messagesContentRef} className="mx-auto max-w-3xl space-y-5">
                    {messages
                      .filter(m => m.role === 'tool_steps' || m.role === 'user' || !!m.content)
                      .map((msg, index) => (
                        msg.role === 'tool_steps'
                          ? <ToolStepsBlock key={`${msg.id}:${index}`} steps={msg.content as ToolStep[]} />
                          : <MessageBubble key={`${msg.id}:${index}`} msg={msg} />
                      ))}
                    {sandboxBooting && (
                      <SandboxBootingBanner />
                    )}
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

          {/* ── Input bar (shown only when there are messages) ── */}
          {!showEmptyPrompt && (
            <div className="shrink-0 border-t border-black/6 px-3 pt-3 dark:border-white/10 sm:px-6 sm:pt-4" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
              <div className="relative mx-auto max-w-3xl">
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

                {/* Autonomy level selector + super agent button */}
                {(() => {
                  const current = AUTONOMY_OPTIONS.find(m => m.key === selectedModel) ?? AUTONOMY_OPTIONS[0];
                  return (
                    <div className="mb-1.5 flex items-center gap-2">
                    <div ref={modelMenuRef} className="relative flex">
                      <button
                        type="button"
                        onClick={() => setModelMenuOpen(o => !o)}
                      className="flex items-center gap-1.5 rounded-full border border-black/8 bg-white/80 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:border-black/20 hover:text-gray-900 dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:hover:border-white/20 dark:hover:text-gray-200"
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0 text-indigo-500">
                          <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.4" />
                          <path d="M3 5h4M5 3v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                        </svg>
                        <span className="hidden sm:inline text-gray-400 dark:text-gray-500">Autonomy level:</span>
                        {current.label}
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className={`shrink-0 transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`}>
                          <path d="M1.5 3L4 5.5L6.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      {modelMenuOpen && (
                        <div className="absolute bottom-full left-0 mb-1.5 z-50 w-56 overflow-hidden rounded-2xl border border-black/8 shadow-lg dark:border-white/10" style={{ backgroundColor: 'var(--bg-card)' }}>
                          <div className="px-3 py-2 border-b border-black/6 dark:border-white/8">
                            <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">Autonomy level</span>
                          </div>
                          {AUTONOMY_OPTIONS.map(opt => (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => { setSelectedModel(opt.key); setModelMenuOpen(false); }}
                              className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/8 ${selectedModel === opt.key ? 'bg-black/5 dark:bg-white/8' : ''}`}
                            >
                              <span>
                                <span className="block text-xs font-medium text-gray-900 dark:text-gray-100">{opt.label}</span>
                                <span className="block text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{opt.description}</span>
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
                      <button
                        type="button"
                        onClick={() => { setSuperAgentOpen(true); setSuperAgentError(null); setSuperAgentWakeSuccess(false); }}
                        disabled={!canConfigureSuperAgent}
                        title={canConfigureSuperAgent ? 'Configure super agent' : 'Send the first task to save this conversation before enabling the super agent'}
                        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          activeConversation?.superAgent?.enabled
                            ? 'border-emerald-200 text-emerald-700 hover:border-emerald-400 dark:border-emerald-900 dark:text-emerald-300 dark:hover:border-emerald-700'
                            : 'border-black/8 bg-white/80 text-gray-500 hover:border-black/20 hover:text-gray-900 dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:hover:border-white/20 dark:hover:text-gray-200'
                        }`}
                      >
                        <span className={`size-1.5 shrink-0 rounded-full ${activeConversation?.superAgent?.enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                        Super agent
                      </button>
                    </div>
                  );
                })()}

                <div
                  className="flex items-end gap-2 rounded-[1.5rem] border border-black/10 px-3 py-2 shadow-sm transition-shadow focus-within:border-black/20 focus-within:shadow-md dark:border-white/10 dark:focus-within:border-white/20 sm:py-2.5"
                  style={{ backgroundColor: 'var(--bg-input)' }}
                >
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-700 active:bg-black/8 dark:text-gray-500 dark:hover:bg-white/8 dark:hover:text-gray-300 sm:size-11"
                    aria-label="Attach image"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M8 3.25v9.5M3.25 8h9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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
                    placeholder="Assign a follow-up task or ask anything"
                    className="flex-1 resize-none bg-transparent py-2.5 sm:py-3 text-base text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
                    style={{ maxHeight: '180px' }}
                  />
                  {loading ? (
                    <button
                      onClick={stopGeneration}
                      aria-label="Stop"
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gray-950 text-white transition-opacity hover:opacity-80 active:opacity-70"
                    >
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      onClick={() => send(input, pendingImage ?? undefined)}
                      disabled={!canSend}
                      aria-label="Send"
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gray-950 text-white transition-opacity hover:opacity-80 disabled:opacity-25 active:opacity-70"
                    >
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                        <path d="M7 12V2M7 2L3 6M7 2L11 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Hint — desktop only */}
                <p className="mt-1.5 hidden text-center text-xs text-gray-400 dark:text-gray-500 sm:block">
                  Enter to send · Shift+Enter for new line · paste images · @ for sandbox files · ⌘⇧S for super agent
                </p>
              </div>
            </div>
          )}

          {/* ── Todo panel (ultrawork loop) ── */}
          <TodoPanel todos={todos} onDismiss={() => setTodos([])} />

          {/* ── Past tasks list ── */}
          {(() => {
            const q = search.trim().toLowerCase();
            const pastTasks = conversations.filter(c => c.messages.length > 0);
            if (loadingHistory || pastTasks.length === 0) return null;
            const filtered = pastTasks.filter((c) => {
              if (!q) return true;
              if (c.title.toLowerCase().includes(q)) return true;
              return c.messages.some(m =>
                (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
                  .toLowerCase()
                  .includes(q),
              );
            });
            return (
              <div
                className="shrink-0 border-t border-gray-200 dark:border-gray-800"
                style={{ backgroundColor: 'var(--bg)' }}
              >
                <div className="mx-auto max-w-3xl px-3 sm:px-6">
                  <div className="flex items-center justify-between py-2">
                    <button
                      onClick={() => setTaskListOpen(o => !o)}
                      className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                    >
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className={`transition-transform ${taskListOpen ? 'rotate-90' : ''}`}>
                        <path d="M3 2l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Past tasks
                      <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500 dark:text-gray-400">{pastTasks.length}</span>
                    </button>
                    {taskListOpen && (
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search…"
                        className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-1 pl-2.5 pr-2 text-xs text-gray-800 dark:text-gray-200 placeholder-gray-400 outline-none focus:border-gray-400 dark:focus:border-gray-600 transition-colors w-24 sm:w-32"
                      />
                    )}
                  </div>
                  {taskListOpen && (
                    <div className="max-h-40 sm:max-h-56 overflow-y-auto pb-3 space-y-0.5">
                      {filtered.length === 0
                        ? (
                            <p className="px-1 py-2 text-xs text-gray-400 dark:text-gray-500">
                              {q ? 'No tasks match your search.' : 'No past tasks.'}
                            </p>
                          )
                        : filtered.map((c, index) => (
                            <div
                              key={`${c.id}:past:${index}`}
                              className={`group flex w-full items-stretch overflow-hidden rounded-xl text-left transition-colors ${
                                c.id === activeId
                                  ? 'bg-black/8 dark:bg-white/10 text-gray-900 dark:text-gray-100'
                                  : 'text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/8 hover:text-gray-900 dark:hover:text-gray-100'
                              }`}
                            >
                              <button
                                onClick={() => { if (renamingId !== c.id) setActiveId(c.id); }}
                                onDoubleClick={e => syncedIds.current.has(c.id) && startRenaming(c.id, c.title, e)}
                                className="min-w-0 flex-1 px-3 py-2 text-left"
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
                                          className="w-full truncate rounded border border-indigo-400 dark:border-indigo-500 bg-white dark:bg-gray-800 px-1 py-0.5 text-xs font-medium text-gray-900 dark:text-gray-100 outline-none ring-2 ring-indigo-300/50"
                                          aria-label="Rename task"
                                        />
                                      )
                                    : (
                                        <span className="flex min-w-0 items-center gap-1.5">
                                          <span className="truncate text-xs font-medium leading-tight">
                                            <HighlightText text={c.title} query={q} />
                                          </span>
                                          {c.activeJobId && (
                                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="shrink-0 text-indigo-400" style={{ animation: 'ona-spin 1s linear infinite' }}>
                                              <circle cx="4" cy="4" r="3.5" stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" />
                                              <path d="M4 0.5A3.5 3.5 0 017.5 4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                                            </svg>
                                          )}
                                        </span>
                                      )}
                                </div>
                                {renamingId !== c.id && (
                                  <p suppressHydrationWarning className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">{relativeTime(c.createdAt)}</p>
                                )}
                              </button>
                              <button
                                onClick={e => deleteConversation(c.id, e)}
                                className="delete-btn flex w-9 shrink-0 items-center justify-center border-l border-black/5 dark:border-white/8 text-gray-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-400 active:bg-red-50 active:text-red-500 dark:active:bg-red-500/10 dark:active:text-red-400"
                                aria-label="Delete task"
                              >
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                                </svg>
                              </button>
                            </div>
                          ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {superAgentOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/25 backdrop-blur-[1px] dark:bg-black/45"
            onClick={() => { setSuperAgentOpen(false); setSuperAgentError(null); setSuperAgentWakeSuccess(false); }}
            aria-label="Close super agent settings"
          />
          <div
            className="relative z-[61] w-full max-w-lg rounded-3xl border border-black/8 p-5 shadow-2xl dark:border-white/10"
            style={{ backgroundColor: 'var(--bg-card)' }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Super agent</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  Wakes this conversation autonomously on a schedule to continue working. Use <strong className="font-medium text-gray-700 dark:text-gray-300">Wake Now</strong> to trigger it instantly, or enable the heartbeat and point a cron job at your deployment.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setSuperAgentOpen(false); setSuperAgentError(null); setSuperAgentWakeSuccess(false); }}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-white/8 dark:hover:text-gray-300"
                aria-label="Close super agent settings"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {superAgentError && (
              <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800/50 dark:bg-red-950/30">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="mt-0.5 shrink-0 text-red-500">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M7 4.5v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <p className="text-xs text-red-700 dark:text-red-300">{superAgentError}</p>
              </div>
            )}

            {superAgentWakeSuccess && (
              <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/50 dark:bg-emerald-950/30">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-emerald-500">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M4.5 7l2 2 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">Super agent woke up — working in the background.</p>
              </div>
            )}

            <div className="mt-5 space-y-4">
              <label className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-800">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Enable heartbeat</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Let a cron job wake this conversation automatically on a schedule.</p>
                </div>
                <input
                  type="checkbox"
                  checked={superAgentEnabled}
                  onChange={e => { setSuperAgentEnabled(e.target.checked); setSuperAgentError(null); }}
                  className="size-4"
                />
              </label>

              {superAgentEnabled && (
                <div className="rounded-2xl border border-gray-200 bg-gray-50/50 px-4 py-3 dark:border-gray-800 dark:bg-white/3">
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Heartbeat endpoint</p>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-[11px] font-mono text-gray-700 dark:text-gray-300">
                      POST /api/super-agent/heartbeat
                    </code>
                    <button
                      type="button"
                      onClick={async () => {
                        const url = `${window.location.origin}/api/super-agent/heartbeat`;
                        const ok = await copyTextToClipboard(url);
                        if (ok) {
                          setSuperAgentUrlCopied(true);
                          setTimeout(() => setSuperAgentUrlCopied(false), 2000);
                        }
                      }}
                      className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-[11px] text-gray-500 dark:text-gray-400 transition-colors hover:border-gray-400 hover:text-gray-900 dark:hover:border-gray-500 dark:hover:text-gray-100"
                      title="Copy URL"
                    >
                      {superAgentUrlCopied
                        ? (
                            <>
                              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 5.5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              Copied
                            </>
                          )
                        : (
                            <>
                              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="3.5" y="1" width="6.5" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.2" /><path d="M1 3.5v6a1 1 0 001 1h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                              Copy
                            </>
                          )}
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">
                    Authenticate with header <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-px font-mono">x-ona-heartbeat-secret: &lt;your secret&gt;</code>. Set the <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-px font-mono">SUPER_AGENT_HEARTBEAT_SECRET</code> env var to configure the secret.
                  </p>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">Heartbeat interval (minutes)</span>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={superAgentHeartbeat}
                    onChange={e => setSuperAgentHeartbeat(e.target.value)}
                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-gray-400 dark:border-gray-800 dark:text-gray-100 dark:focus:border-gray-600"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">Model</span>
                  <select
                    value={superAgentModel}
                    onChange={e => setSuperAgentModel(e.target.value)}
                    className="w-full rounded-2xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-gray-400 dark:border-gray-800 dark:text-gray-100 dark:focus:border-gray-600"
                  >
                    {AUTONOMY_OPTIONS.map(option => (
                      <option key={option.key} value={option.key} className="text-black">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">Wake prompt</span>
                <textarea
                  value={superAgentPrompt}
                  onChange={e => setSuperAgentPrompt(e.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-2xl border border-gray-200 bg-transparent px-3 py-2 text-sm leading-relaxed text-gray-900 outline-none transition-colors focus:border-gray-400 dark:border-gray-800 dark:text-gray-100 dark:focus:border-gray-600"
                />
              </label>

              <div className="rounded-2xl border border-gray-200 px-4 py-3 text-xs dark:border-gray-800">
                {(() => {
                  const status = activeConversation?.superAgent?.lastRunStatus ?? 'idle';
                  const statusColor = status === 'error'
                    ? 'text-red-600 dark:text-red-400'
                    : status === 'running'
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : status === 'success'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-gray-500 dark:text-gray-400';
                  return (
                    <div className="space-y-1 text-gray-600 dark:text-gray-300">
                      <p>Status: <span className={`font-medium ${statusColor}`}>{status}</span></p>
                      <p>Next run: {activeConversation?.superAgent?.nextHeartbeatAt ? new Date(activeConversation.superAgent.nextHeartbeatAt).toLocaleString() : <span className="text-gray-400 dark:text-gray-500">Not scheduled</span>}</p>
                      <p>Last run: {activeConversation?.superAgent?.lastHeartbeatAt ? new Date(activeConversation.superAgent.lastHeartbeatAt).toLocaleString() : <span className="text-gray-400 dark:text-gray-500">Never</span>}</p>
                      {!canConfigureSuperAgent && (
                        <p className="text-amber-600 dark:text-amber-400">Send the first task to save this conversation before enabling the super agent.</p>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={wakeSuperAgentNow}
                disabled={!canConfigureSuperAgent || superAgentWaking || superAgentWakeSuccess}
                className="flex items-center justify-center gap-1.5 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-gray-100"
              >
                {superAgentWaking
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
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setSuperAgentOpen(false); setSuperAgentError(null); setSuperAgentWakeSuccess(false); }}
                  className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveSuperAgentSettings}
                  disabled={superAgentSaving || !canConfigureSuperAgent}
                  className="rounded-full bg-gray-950 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-100 dark:text-gray-950"
                >
                  {superAgentSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] dark:bg-black/45"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close history"
        />
      )}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-[100dvh] w-full max-w-sm flex-col border-l border-black/8 shadow-2xl transition-transform duration-200 dark:border-white/10 sm:w-96 ${
          sidebarOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ backgroundColor: 'var(--bg-sidebar)' }}
        aria-hidden={!sidebarOpen}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/8 px-4 dark:border-white/10">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Task history</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Search, rename, or delete tasks</p>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="flex size-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/8 dark:hover:text-gray-100"
            aria-label="Close history"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {sidebarContent}
      </aside>

      {/* ── Sandbox ready toast ── */}
      {sandboxToastId && (
        <SandboxToast sandboxId={sandboxToastId} onDismiss={() => setSandboxToastId(null)} />
      )}
    </div>
  );
}
