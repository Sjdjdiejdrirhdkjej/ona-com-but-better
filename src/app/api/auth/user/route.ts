import { NextResponse } from 'next/server';

import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { getUser } from '@/libs/auth';
import { userCreditsSchema } from '@/models/Schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json(null, { status: 401 });
  }
  const credits = await db
    .select({ credits: userCreditsSchema.credits })
    .from(userCreditsSchema)
    .where(eq(userCreditsSchema.userId, user.id))
    .limit(1);

  return NextResponse.json({
    ...user,
    credits: credits[0]?.credits ?? 0,
  });
}
