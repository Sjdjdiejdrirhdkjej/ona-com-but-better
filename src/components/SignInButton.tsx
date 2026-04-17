'use client';

import { signIn } from '@/libs/auth-client';

export function SignInButton() {
  return (
    <button
      type="button"
      onClick={signIn}
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
      Sign in with Replit
    </button>
  );
}
