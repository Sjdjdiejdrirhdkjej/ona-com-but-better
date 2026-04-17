import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';

import { routing } from './libs/I18nRouting';

const handleI18nRouting = createIntlMiddleware(routing);

const isProtectedRoute = (pathname: string) =>
  /\/(en|fr)?\/?(app)(\/|$)/.test(pathname)
  || pathname === '/app'
  || pathname.startsWith('/app/');

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip middleware entirely for API routes
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  if (isProtectedRoute(pathname)) {
    const sessionCookie = req.cookies.get('replit_session');
    if (!sessionCookie) {
      return NextResponse.redirect(new URL('/api/login', req.url));
    }
  }

  return handleI18nRouting(req);
}

export const config = {
  matcher: [
    '/((?!_next|_vercel|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
};
