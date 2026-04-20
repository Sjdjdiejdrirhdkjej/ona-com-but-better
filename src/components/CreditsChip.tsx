'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/libs/auth-client';

type CreditsUpdatedDetail = { credits: number };

function formatCredits(value: number): string {
  return new Intl.NumberFormat().format(value);
}

/**
 * Header chip that displays the authenticated user's credit balance. On mount
 * it fetches the current balance from /api/credits/balance so the chip is
 * accurate on page load. It then listens for `credits-updated` CustomEvents
 * (dispatched by the chat page when the server streams a `credit_update` SSE
 * event) so the value stays fresh during a live conversation.
 */
export function CreditsChip() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setCredits(null);
      return;
    }

    let cancelled = false;
    let eventSeen = false;
    setLoading(true);

    fetch('/api/credits/balance')
      .then(res => (res.ok ? res.json() : null))
      .then((data: { credits?: number } | null) => {
        if (cancelled) return;
        // If a live credits-updated event already arrived, it is fresher than
        // this fetch response — don't clobber it.
        if (eventSeen) return;
        if (data && typeof data.credits === 'number') {
          setCredits(data.credits);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    function handleUpdate(event: Event) {
      const detail = (event as CustomEvent<CreditsUpdatedDetail>).detail;
      if (detail && typeof detail.credits === 'number') {
        eventSeen = true;
        setCredits(detail.credits);
      }
    }

    window.addEventListener('credits-updated', handleUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener('credits-updated', handleUpdate);
    };
  }, [isAuthenticated]);

  if (authLoading || !isAuthenticated) {
    return null;
  }

  const depleted = credits !== null && credits <= 0;
  const label = credits === null
    ? (loading ? '…' : '—')
    : formatCredits(credits);

  return (
    <span
      aria-label={credits !== null ? `Credit balance: ${label}` : 'Credit balance'}
      title={credits !== null ? `${label} credits remaining` : 'Credit balance'}
      className={[
        'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium',
        'transition-colors select-none',
        depleted
          ? 'border-red-400/40 bg-red-500/10 text-red-700 dark:border-red-400/30 dark:text-red-300'
          : 'border-black/10 bg-black/5 text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200',
      ].join(' ')}
    >
      <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M7 4v3l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="tabular-nums">{label}</span>
    </span>
  );
}
