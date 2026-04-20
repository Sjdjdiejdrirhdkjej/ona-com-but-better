import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authFailureResponse, getRequestAuth, isAuthFailure } from '@/libs/ApiKeys';
import { getUserCredits } from '@/libs/Credits';

export const runtime = 'nodejs';

/**
 * GET /api/credits/balance
 *
 * Returns the authenticated user's current credit balance. Accepts either the
 * session cookie or an API-key Bearer token so the same endpoint works for the
 * in-app UI and programmatic callers.
 */
export async function GET(req: NextRequest) {
  const auth = await getRequestAuth(req);
  if (isAuthFailure(auth)) {
    return authFailureResponse(auth);
  }
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const credits = await getUserCredits(auth.userId);
  return NextResponse.json({ credits }, {
    headers: {
      // Balance changes per request — never cache.
      'Cache-Control': 'no-store',
    },
  });
}
