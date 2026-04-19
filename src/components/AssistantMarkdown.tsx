'use client';

import { useMemo } from 'react';
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

export default function AssistantMarkdown({ text }: { text: string }) {
  const html = useMemo(() => {
    const stripped = text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();
    return marked(stripped);
  }, [text]);

  return (
    <div
      className="prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
