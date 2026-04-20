'use client';

import { useMemo, useState } from 'react';
import marked from 'marked';
import hljs from 'highlight.js';

const renderer = new marked.Renderer();

renderer.code = function (code: string, infostring: string | undefined) {
  const lang = (infostring || '').split(' ')[0] || '';
  const language = hljs.getLanguage(lang) ? lang : 'plaintext';
  const highlighted = hljs.highlight(code, { language }).value;
  return `<pre class="mb-2 mt-1 overflow-hidden rounded-lg"><code class="block overflow-x-auto font-mono whitespace-pre hljs language-${language}">${highlighted}</code></pre>`;
};

renderer.codespan = function (code: string) {
  return `<code class="rounded bg-black/10 dark:bg-white/10 px-1 py-0.5 font-mono text-xs">${code}</code>`;
};

renderer.paragraph = function (text: string) {
  return `<p class="mb-2 last:mb-0">${text}</p>\n`;
};

renderer.strong = function (text: string) {
  return `<strong class="font-semibold">${text}</strong>`;
};

renderer.em = function (text: string) {
  return `<em class="italic">${text}</em>`;
};

renderer.heading = function (text: string, level: number) {
  const classes: Record<number, string> = {
    1: 'mb-2 mt-3 text-base font-bold first:mt-0',
    2: 'mb-2 mt-3 text-sm font-bold first:mt-0',
    3: 'mb-1 mt-2 text-sm font-semibold first:mt-0',
  };
  const cls = classes[level] ?? 'mb-1 mt-2 font-semibold first:mt-0';
  return `<h${level} class="${cls}">${text}</h${level}>\n`;
};

renderer.list = function (body: string, ordered: boolean) {
  const tag = ordered ? 'ol' : 'ul';
  const cls = ordered ? 'mb-2 ml-4 list-decimal space-y-0.5' : 'mb-2 ml-4 list-disc space-y-0.5';
  return `<${tag} class="${cls}">${body}</${tag}>\n`;
};

renderer.listitem = function (text: string) {
  return `<li class="leading-relaxed">${text}</li>\n`;
};

renderer.blockquote = function (quote: string) {
  return `<blockquote class="mb-2 border-l-2 border-gray-400 dark:border-gray-500 pl-3 italic text-gray-600 dark:text-gray-400">${quote}</blockquote>\n`;
};

renderer.link = function (href: string | null, _title: string | null, text: string) {
  return `<a href="${href ?? '#'}" target="_blank" rel="noopener noreferrer" class="underline hover:opacity-70">${text}</a>`;
};

renderer.hr = function () {
  return `<hr class="my-2 border-gray-300 dark:border-gray-600" />\n`;
};

renderer.table = function (header: string, body: string) {
  return `<div class="mb-2 overflow-x-auto"><table class="min-w-full text-xs">${header}${body}</table></div>\n`;
};

renderer.tablecell = function (content: string, flags: { header: boolean; align: string | null }) {
  const tag = flags.header ? 'th' : 'td';
  const cls = flags.header
    ? 'border border-gray-300 dark:border-gray-600 px-2 py-1 text-left font-semibold'
    : 'border border-gray-300 dark:border-gray-600 px-2 py-1';
  return `<${tag} class="${cls}">${content}</${tag}>\n`;
};

marked.setOptions({ renderer, gfm: true, breaks: false });

type Segment =
  | { kind: 'think'; content: string; complete: boolean; index: number }
  | { kind: 'content'; content: string };

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  const thinkRe = /<think>([\s\S]*?)(<\/think>|$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let thinkIndex = 0;

  while ((match = thinkRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: 'content', content: text.slice(lastIndex, match.index) });
    }
    const complete = match[2] === '</think>';
    segments.push({ kind: 'think', content: match[1] ?? '', complete, index: thinkIndex++ });
    lastIndex = match.index + match[0].length;
    if (!complete) break;
  }

  if (lastIndex < text.length) {
    segments.push({ kind: 'content', content: text.slice(lastIndex) });
  }

  return segments;
}

function ThinkBlock({ content, complete, index }: { content: string; complete: boolean; index: number }) {
  const [open, setOpen] = useState(!complete);

  const isLive = !complete;

  return (
    <div className="mb-2 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-900/40 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition-colors"
      >
        {isLive
          ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-slate-400 animate-spin">
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" strokeOpacity="0.25" />
                <path d="M6 1.5A4.5 4.5 0 0110.5 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            )
          : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-slate-400">
                <path
                  d="M6 1.5C4.07 1.5 2.5 3.07 2.5 5c0 1.05.46 1.98 1.19 2.62V9h4.62V7.62A3.5 3.5 0 006 1.5z"
                  stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"
                />
                <path d="M4.2 9h3.6M5 10.5h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
              </svg>
            )}
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          {isLive ? 'Thinking…' : `Thought${index > 0 ? ` ${index + 1}` : ''}`}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className="ml-auto shrink-0 text-slate-400 transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-slate-200 dark:border-slate-700/60 px-3 py-2.5 max-h-72 overflow-y-auto">
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            {content.trim()}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function AssistantMarkdown({ text }: { text: string }) {
  const segments = useMemo(() => parseSegments(text), [text]);

  return (
    <div className="prose-sm max-w-none">
      {segments.map((seg, i) => {
        if (seg.kind === 'think') {
          return (
            <ThinkBlock
              key={`think-${seg.index}`}
              content={seg.content}
              complete={seg.complete}
              index={seg.index}
            />
          );
        }
        const html = marked(seg.content.trim());
        if (!html.trim()) return null;
        return (
          <div
            key={`content-${i}`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </div>
  );
}
