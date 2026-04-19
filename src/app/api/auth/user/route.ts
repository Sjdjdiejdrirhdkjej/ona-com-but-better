import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@/libs/ReplitAuth';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    if (request.nextUrl.searchParams.has('optional')) {
      return NextResponse.json(null);
    }

    return NextResponse.json(null, { status: 401 });
  }
  return NextResponse.json(session.user);
}
