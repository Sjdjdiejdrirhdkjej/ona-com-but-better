'use client';

import type { ReactNode } from 'react';
import { AppConfig } from '@/utils/AppConfig';
import { isMobileBrowser, navigateTopLevel } from '@/utils/browserCompat';

type GetStartedLinkProps = {
  children: ReactNode;
  className?: string;
  locale: string;
};

function getReturnTo(locale: string) {
  return locale === AppConfig.defaultLocale ? '/dashboard' : `/${locale}/dashboard`;
}

function getSignInPath(locale: string) {
  return locale === AppConfig.defaultLocale ? '/sign-in' : `/${locale}/sign-in`;
}

export function GetStartedLink({ children, className, locale }: GetStartedLinkProps) {
  const returnTo = getReturnTo(locale);
  const signInHref = `${getSignInPath(locale)}?returnTo=${encodeURIComponent(returnTo)}`;
  const loginHref = `/api/login?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <a
      href={signInHref}
      target="_top"
      rel="noreferrer"
      className={className}
      onClick={(event) => {
        if (isMobileBrowser()) {
          return;
        }

        event.preventDefault();
        navigateTopLevel(loginHref);
      }}
    >
      {children}
    </a>
  );
}