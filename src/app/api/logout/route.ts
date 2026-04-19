import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAppBaseUrl, getSession } from '@/libs/ReplitAuth';

export async function GET(request: NextRequest) {
  const session = await getSession();
  session.destroy();
  return NextResponse.redirect(new URL('/', getAppBaseUrl(request)));
}
