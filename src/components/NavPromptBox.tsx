'use client';

import { useRef, useState } from 'react';

export function NavPromptBox() {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setValue('');
    inputRef.current?.blur();
  }

  return (
    <form onSubmit={handleSubmit} className="relative flex items-center">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Ask anything…"
        className="h-8 w-48 rounded-full border border-gray-300 bg-white/70 pl-3.5 pr-9 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all focus:w-64 focus:border-gray-400 focus:bg-white focus:shadow-sm"
        style={{ backdropFilter: 'blur(6px)' }}
      />
      <button
        type="submit"
        aria-label="Send"
        className="absolute right-1.5 flex size-5 items-center justify-center rounded-full bg-gray-900 text-white transition-opacity hover:opacity-80 disabled:opacity-30"
        disabled={!value.trim()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 8.5V1.5M5 1.5L2 4.5M5 1.5L8 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </form>
  );
}
