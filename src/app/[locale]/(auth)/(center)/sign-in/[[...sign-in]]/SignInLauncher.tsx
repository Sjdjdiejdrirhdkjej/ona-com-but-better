'use client';

import { useEffect, useState } from 'react';

type SignInLauncherProps = {
  autoStart: boolean;
  href: string;
  label: string;
  returnTo: string;
};

export function SignInLauncher({ autoStart, href, label, returnTo }: SignInLauncherProps) {
  const [isStarting, setIsStarting] = useState(autoStart);

  function startAuth() {
    const destination = new URL(href, window.location.origin).toString();

    try {
      if (window.top && window.top !== window.self) {
        window.top.location.assign(destination);
        return;
      }
    } catch {
    }

    window.location.assign(destination);
  }

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data?.type === 'ona-auth-complete') {
        const nextPath = typeof event.data.returnTo === 'string' ? event.data.returnTo : returnTo;
        window.location.assign(nextPath);
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [returnTo]);

  useEffect(() => {
    if (!autoStart) {
      setIsStarting(false);
      return;
    }

    const timer = window.setTimeout(() => {
      startAuth();
    }, 350);

    return () => window.clearTimeout(timer);
  }, [autoStart, href]);

  return (
    <a
      href={href}
      target="_top"
      onClick={(event) => {
        event.preventDefault();
        setIsStarting(true);
        startAuth();
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px 24px',
        backgroundColor: '#18182a',
        color: '#fff',
        borderRadius: '8px',
        fontSize: '15px',
        fontWeight: 500,
        textDecoration: 'none',
      }}
    >
      {isStarting ? 'Opening Replit sign-in…' : label}
    </a>
  );
}