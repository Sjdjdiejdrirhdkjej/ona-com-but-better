'use client';

import { useRouter } from 'next/navigation';

export function SignInButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push('/app')}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '12px 24px',
        backgroundColor: '#18182a',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        fontSize: '15px',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'opacity 0.2s',
      }}
    >
      Get started
    </button>
  );
}
