import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authFailureResponse, getRequestAuth, isAuthFailure } from '@/libs/ApiKeys';
import { topupUserCredits } from '@/libs/Credits';

export const runtime = 'nodejs';

const TOPUP_AMOUNT = 1000;

/**
 * POST /api/credits/topup
 *
 * Adds a fixed top-up amount (1,000 credits) to the authenticated user's
 * balance. Accepts either the session cookie or an API-key Bearer token.
 */
export async function POST(req: NextRequest) {
  const auth = await getRequestAuth(req);
  if (isAuthFailure(auth)) {
    return authFailureResponse(auth);
  }
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const balance = await topupUserCredits(auth.userId, TOPUP_AMOUNT);

  if (balance === null) {
    return NextResponse.json(
      { error: 'Failed to top up credits. Please try again.' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { credits: balance, added: TOPUP_AMOUNT },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
