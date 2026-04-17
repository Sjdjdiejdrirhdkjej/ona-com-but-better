'use client';

import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

const MARKDOWN_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>['components'] = {
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
      ? <code className={`block overflow-x-auto font-mono whitespace-pre ${className ?? ''}`}>{children}</code>
      : <code className="rounded bg-black/10 dark:bg-white/10 px-1 py-0.5 font-mono text-xs">{children}</code>;
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
    <div className="mb-2 overflow-x-auto"><table className="min-w-full text-xs">{children}</table></div>
  ),
  th: ({ children }) => <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">{children}</td>,
};

function parseThinkingBlocks(text: string): Array<{ type: 'thinking' | 'text'; content: string }> {
  const parts: Array<{ type: 'thinking' | 'text'; content: string }> = [];
  const regex = /<think>([\s\S]*?)(<\/think>|$)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before) parts.push({ type: 'text', content: before });
    if (match[1]) parts.push({ type: 'thinking', content: match[1] });
    lastIndex = match.index + match[0].length;
  }
  const remaining = text.slice(lastIndex);
  if (remaining) parts.push({ type: 'text', content: remaining });
  return parts;
}

export default function AssistantMarkdown({ text }: { text: string }) {
  const blocks = parseThinkingBlocks(text);
  return (
    <>
      {blocks.map((block, i) =>
        block.type === 'thinking'
          ? (
              <div
                key={i}
                className="mb-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 px-3 py-2.5"
              >
                <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M5 3v2.2L6.2 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  Thinking
                </span>
                <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-gray-400 dark:text-gray-600">
                  {block.content.trim()}
                </p>
              </div>
            )
          : (
              <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={MARKDOWN_COMPONENTS}>
                {block.content}
              </ReactMarkdown>
            ),
      )}
    </>
  );
}
