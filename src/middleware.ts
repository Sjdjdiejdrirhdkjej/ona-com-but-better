import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';

import { routing } from './libs/I18nRouting';

const handleI18nRouting = createIntlMiddleware(routing);

const isProtectedRoute = (pathname: string) =>
  /\/(en|fr)?\/?(dashboard)(\/|$)/.test(pathname)
  || pathname === '/dashboard'
  || pathname.startsWith('/dashboard/');

export default async function middleware(req: NextRequest) {
  if (isProtectedRoute(req.nextUrl.pathname)) {
    const sessionToken
      = req.cookies.get('next-auth.session-token')
      ?? req.cookies.get('__Secure-next-auth.session-token');

    if (!sessionToken) {
      return NextResponse.redirect(new URL('/sign-in', req.url));
    }
  }

  return handleI18nRouting(req);
}

export const config = {
  matcher: [
    '/((?!_next|_vercel|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
