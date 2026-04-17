import { NextResponse } from 'next/server';

import { getUser } from '@/libs/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json(null, { status: 401 });
  }
  return NextResponse.json(user);
}
