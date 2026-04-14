'use client';

import { useRef, useState } from 'react';

const SERIF = 'Georgia, "Times New Roman", serif';

type Message = {
  id: number;
  role: 'user' | 'agent';
  text: string;
};

const SUGGESTIONS = [
  'Weekly digest of changed files',
  'Review open pull requests',
  'Find and fix CVEs in my repos',
  'Migrate a COBOL service to Java',
];

export default function AppPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { id: Date.now(), role: 'user', text: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    setTimeout(() => {
      const agentMsg: Message = {
        id: Date.now() + 1,
        role: 'agent',
        text: `Got it — spinning up a background agent to handle: "${trimmed}". You'll receive a pull request once it's done.`,
      };
      setMessages(prev => [...prev, agentMsg]);
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }, 1200);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Messages or empty state ── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
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
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'agent' && (
                      <div
                        className="mr-2.5 mt-1 flex size-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ background: 'linear-gradient(135deg,#7b68ee,#9370db)' }}
                      >
                        O
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'rounded-tr-sm bg-gray-900 text-white'
                          : 'rounded-tl-sm border border-gray-200 text-gray-800'
                      }`}
                      style={msg.role === 'agent' ? { backgroundColor: '#eceae4' } : {}}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div
                      className="mr-2.5 mt-1 flex size-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: 'linear-gradient(135deg,#7b68ee,#9370db)' }}
                    >
                      O
                    </div>
                    <div
                      className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-gray-200 px-4 py-3"
                      style={{ backgroundColor: '#eceae4' }}
                    >
                      {[0, 1, 2].map(i => (
                        <span
                          key={i}
                          className="size-1.5 rounded-full bg-gray-400"
                          style={{ animation: `bounce 1s ease-in-out ${i * 0.15}s infinite` }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            )}
      </div>

      {/* ── Input bar ── */}
      <div className="flex-shrink-0 border-t border-gray-200 px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <div
            className="flex items-end gap-3 rounded-2xl border border-gray-300 px-4 py-3 transition-shadow focus-within:border-gray-400 focus-within:shadow-sm"
            style={{ backgroundColor: '#fff' }}
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={autoResize}
              onKeyDown={handleKey}
              placeholder="Describe a task for your agent…"
              className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
              style={{ maxHeight: '180px' }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              aria-label="Send"
              className="flex size-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-950 text-white transition-opacity hover:opacity-80 disabled:opacity-25"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 12V2M7 2L3 6M7 2L11 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-gray-400">
            Press
            {' '}
            <kbd className="rounded border border-gray-200 px-1 py-0.5 font-mono text-xs">Enter</kbd>
            {' '}
            to send · Shift+Enter for new line
          </p>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
      `}
      </style>
    </div>
  );
}
