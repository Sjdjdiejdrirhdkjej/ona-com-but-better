import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { createApiKeySecret, getApiKeyPrefix, hashApiKey, normalizeApiKeyScope } from '@/libs/ApiKeys';
import { db } from '@/libs/DB';
import { getSession } from '@/libs/ReplitAuth';
import { apiKeysSchema } from '@/models/Schema';

export async function GET() {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKeys = await db
    .select({
      id: apiKeysSchema.id,
      name: apiKeysSchema.name,
      keyPrefix: apiKeysSchema.keyPrefix,
      scope: apiKeysSchema.scope,
      requestCount: apiKeysSchema.requestCount,
      rateLimitPerHour: apiKeysSchema.rateLimitPerHour,
      createdAt: apiKeysSchema.createdAt,
      lastUsedAt: apiKeysSchema.lastUsedAt,
      revokedAt: apiKeysSchema.revokedAt,
    })
    .from(apiKeysSchema)
    .where(eq(apiKeysSchema.userId, session.user.id))
    .orderBy(desc(apiKeysSchema.createdAt));

  return NextResponse.json({ apiKeys });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { name?: unknown; scope?: unknown };
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 80) : 'Default key';
  const scope = normalizeApiKeyScope(body.scope);
  const apiKey = createApiKeySecret();

  const [created] = await db
    .insert(apiKeysSchema)
    .values({
      userId: session.user.id,
      name,
      keyHash: hashApiKey(apiKey),
      keyPrefix: getApiKeyPrefix(apiKey),
      scope,
    })
    .returning({
      id: apiKeysSchema.id,
      name: apiKeysSchema.name,
      keyPrefix: apiKeysSchema.keyPrefix,
      scope: apiKeysSchema.scope,
      requestCount: apiKeysSchema.requestCount,
      rateLimitPerHour: apiKeysSchema.rateLimitPerHour,
      createdAt: apiKeysSchema.createdAt,
      lastUsedAt: apiKeysSchema.lastUsedAt,
      revokedAt: apiKeysSchema.revokedAt,
    });

  return NextResponse.json({ apiKey, record: created }, { status: 201 });
}