import type { NextRequest } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { getSession } from '@/libs/ReplitAuth';
import { apiKeyRateLimitsSchema, apiKeysSchema } from '@/models/Schema';

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export type ApiKeyScope = 'read_only' | 'task_running';

export type RequestAuth = {
  userId: string;
  source: 'session' | 'api_key';
  apiKeyId?: string;
  apiKeyScope?: ApiKeyScope;
};

export type RequestAuthFailure = {
  error: 'invalid_api_key' | 'rate_limited' | 'insufficient_scope';
  status: 401 | 403 | 429;
  message: string;
  limit?: number;
  remaining?: number;
  resetAt?: Date;
  retryAfterSeconds?: number;
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

export function normalizeApiKeyScope(scope: unknown): ApiKeyScope {
  return scope === 'read_only' ? 'read_only' : 'task_running';
}

export function requireApiKeyScope(auth: RequestAuth | null, scope: ApiKeyScope): RequestAuthFailure | null {
  if (!auth || auth.source !== 'api_key' || scope === 'read_only' || auth.apiKeyScope === 'task_running') {
    return null;
  }

  return {
    error: 'insufficient_scope',
    status: 403,
    message: 'This API key is read-only. Create a task-running API key to perform this action.',
  };
}

export function getBearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function isAuthFailure(auth: RequestAuth | RequestAuthFailure | null): auth is RequestAuthFailure {
  return Boolean(auth && 'error' in auth);
}

export function authFailureResponse(auth: RequestAuthFailure) {
  const headers = new Headers();
  if (auth.retryAfterSeconds) {
    headers.set('Retry-After', String(auth.retryAfterSeconds));
  }

  return Response.json({
    error: auth.error,
    message: auth.message,
    limit: auth.limit,
    remaining: auth.remaining,
    resetAt: auth.resetAt?.toISOString(),
  }, { status: auth.status, headers });
}

async function trackApiKeyUsage(apiKey: { id: string; rateLimitPerHour: number }) {
  const now = new Date();
  const [window] = await db
    .select()
    .from(apiKeyRateLimitsSchema)
    .where(eq(apiKeyRateLimitsSchema.apiKeyId, apiKey.id))
    .limit(1);

  const resetAt = window ? new Date(window.windowStart.getTime() + RATE_LIMIT_WINDOW_MS) : new Date(now.getTime() + RATE_LIMIT_WINDOW_MS);

  if (!window || resetAt <= now) {
    await db
      .insert(apiKeyRateLimitsSchema)
      .values({
        apiKeyId: apiKey.id,
        windowStart: now,
        requestCount: 1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: apiKeyRateLimitsSchema.apiKeyId,
        set: {
          windowStart: now,
          requestCount: 1,
          updatedAt: now,
        },
      });

    await db
      .update(apiKeysSchema)
      .set({
        lastUsedAt: now,
        requestCount: sql`${apiKeysSchema.requestCount} + 1`,
      })
      .where(eq(apiKeysSchema.id, apiKey.id));

    return { remaining: Math.max(apiKey.rateLimitPerHour - 1, 0), resetAt: new Date(now.getTime() + RATE_LIMIT_WINDOW_MS) };
  }

  if (window.requestCount >= apiKey.rateLimitPerHour) {
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));
    return {
      rateLimited: true,
      remaining: 0,
      resetAt,
      retryAfterSeconds,
    };
  }

  await db
    .update(apiKeyRateLimitsSchema)
    .set({
      requestCount: sql`${apiKeyRateLimitsSchema.requestCount} + 1`,
      updatedAt: now,
    })
    .where(eq(apiKeyRateLimitsSchema.apiKeyId, apiKey.id));

  await db
    .update(apiKeysSchema)
    .set({
      lastUsedAt: now,
      requestCount: sql`${apiKeysSchema.requestCount} + 1`,
    })
    .where(eq(apiKeysSchema.id, apiKey.id));

  return { remaining: Math.max(apiKey.rateLimitPerHour - window.requestCount - 1, 0), resetAt };
}

export async function getRequestAuth(req: NextRequest): Promise<RequestAuth | RequestAuthFailure | null> {
  const token = getBearerToken(req);
  if (token) {
    const keyHash = hashApiKey(token);
    const [apiKey] = await db
      .select({
        id: apiKeysSchema.id,
        userId: apiKeysSchema.userId,
        scope: apiKeysSchema.scope,
        rateLimitPerHour: apiKeysSchema.rateLimitPerHour,
      })
      .from(apiKeysSchema)
      .where(and(eq(apiKeysSchema.keyHash, keyHash), isNull(apiKeysSchema.revokedAt)))
      .limit(1);

    if (!apiKey) {
      return {
        error: 'invalid_api_key',
        status: 401,
        message: 'Invalid API key.',
      };
    }

    const usage = await trackApiKeyUsage(apiKey);
    if ('rateLimited' in usage) {
      return {
        error: 'rate_limited',
        status: 429,
        message: 'API key rate limit exceeded.',
        limit: apiKey.rateLimitPerHour,
        remaining: 0,
        resetAt: usage.resetAt,
        retryAfterSeconds: usage.retryAfterSeconds,
      };
    }

    return {
      userId: apiKey.userId,
      source: 'api_key',
      apiKeyId: apiKey.id,
      apiKeyScope: normalizeApiKeyScope(apiKey.scope),
    };
  }

  const session = await getSession();
  if (session.user) {
    return { userId: session.user.id, source: 'session' };
  }

  return null;
}