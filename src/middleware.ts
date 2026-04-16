import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import createIntlMiddleware from 'next-intl/middleware';

import { routing } from './libs/I18nRouting';

const handleI18nRouting = createIntlMiddleware(routing);

const isProtectedRoute = createRouteMatcher([
  '/*/dashboard(.*)',
  '/dashboard(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
  return handleI18nRouting(req);
});

export const config = {
  matcher: '/((?!_next|_vercel|api|.*\\..*).*)',
};
