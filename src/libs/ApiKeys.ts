import type { NextRequest } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { getSession } from '@/libs/ReplitAuth';
import { apiKeysSchema } from '@/models/Schema';

export type RequestAuth = {
  userId: string;
  source: 'session' | 'api_key';
};

export function createApiKeySecret() {
  return `ona_${randomBytes(32).toString('base64url')}`;
}

export function hashApiKey(apiKey: string) {
  return createHash('sha256').update(apiKey).digest('hex');
}

export function getApiKeyPrefix(apiKey: string) {
  return apiKey.slice(0, 12);
}

export function getBearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function getRequestAuth(req: NextRequest): Promise<RequestAuth | null> {
  const token = getBearerToken(req);
  if (token) {
    const keyHash = hashApiKey(token);
    const [apiKey] = await db
      .select({ id: apiKeysSchema.id, userId: apiKeysSchema.userId })
      .from(apiKeysSchema)
      .where(and(eq(apiKeysSchema.keyHash, keyHash), isNull(apiKeysSchema.revokedAt)))
      .limit(1);

    if (!apiKey) {
      return null;
    }

    await db
      .update(apiKeysSchema)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeysSchema.id, apiKey.id));

    return { userId: apiKey.userId, source: 'api_key' };
  }

  const session = await getSession();
  if (session.user) {
    return { userId: session.user.id, source: 'session' };
  }

  return null;
}