'use client';

import { useEffect, useState } from 'react';
import { getSafeBrowserReturnPath, navigateTopLevel } from '@/utils/browserCompat';

type SignInLauncherProps = {
  autoStart: boolean;
  href: string;
  label: string;
  returnTo: string;
};

export function SignInLauncher({ autoStart, href, label, returnTo }: SignInLauncherProps) {
  const [isStarting, setIsStarting] = useState(autoStart);

  function startAuth() {
    navigateTopLevel(href);
  }

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data?.type === 'ona-auth-complete') {
        const nextPath = getSafeBrowserReturnPath(
          typeof event.data.returnTo === 'string' ? event.data.returnTo : returnTo,
          returnTo,
        );
        navigateTopLevel(nextPath);
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

    startAuth();
  }, [autoStart, href]);

  return (
    <a
      href={href}
      target="_top"
      rel="noreferrer"
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