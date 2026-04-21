import type { NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';

import { routing } from './libs/I18nRouting';
import { isShuttingDown, incrementActiveRequests, getShutdownStatus } from './libs/GracefulShutdown';

const handleI18nRouting = createIntlMiddleware(routing);
const isHealthEndpoint = (pathname: string) => pathname === '/api/healthz' || pathname === '/api/readiness';

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/api/')) {
    if (isShuttingDown() && !isHealthEndpoint(pathname)) {
      return new Response(
        JSON.stringify({ error: 'Server is shutting down', status: getShutdownStatus() }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!isHealthEndpoint(pathname)) {
      incrementActiveRequests();
    }

    return;
  }

  return handleI18nRouting(req);
}

export const config = {
  matcher: [
    '/((?!_next|_vercel|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
};
