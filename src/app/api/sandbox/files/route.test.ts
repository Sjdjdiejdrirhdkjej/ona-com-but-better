import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The route under test pulls in the database, sandbox provider, and session
// layer. Mock them so the authorization behaviour can be tested in isolation.
vi.mock('@/libs/DB', () => ({
  db: {
    select: vi.fn(() => ({ from: () => ({ where: vi.fn() }) })),
  },
}));

vi.mock('@/libs/Daytona', () => ({
  listAllSandboxFiles: vi.fn(async () => ['src/index.ts']),
}));

const getSessionMock = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('@/libs/ReplitAuth', () => ({
  getSession: getSessionMock,
}));

import { GET } from './route';
import { listAllSandboxFiles } from '@/libs/Daytona';
import { db } from '@/libs/DB';

function makeRequest(conversationId?: string) {
  const url = conversationId
    ? `http://localhost:3000/api/sandbox/files?conversationId=${conversationId}`
    : 'http://localhost:3000/api/sandbox/files';
  return new NextRequest(url);
}

/** Collect the bound parameter values from a drizzle `and(...)` expression. */
function queryParams(whereArg: unknown): unknown[] {
  const values: unknown[] = [];
  const walk = (node: unknown, depth = 0): void => {
    if (!node || typeof node !== 'object' || depth > 6) return;
    if ('value' in (node as Record<string, unknown>)) {
      values.push((node as { value: unknown }).value);
    }
    if ('queryChunks' in (node as Record<string, unknown>)) {
      for (const chunk of (node as { queryChunks: unknown[] }).queryChunks) walk(chunk, depth + 1);
    }
  };
  walk(whereArg);
  return values;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockReset().mockResolvedValue({});
});

describe('GET /api/sandbox/files', () => {
  it('rejects unauthenticated requests with 401 and never touches the sandbox', async () => {
    const res = await GET(makeRequest('conv-1'));

    expect(res.status).toBe(401);
    expect(listAllSandboxFiles).not.toHaveBeenCalled();
  });

  it('returns sandbox files for a conversation owned by the caller', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'user-1' } });
    const where = vi.fn(async () => [{ sandboxId: 'sbx-1' }]);
    vi.mocked(db.select).mockReturnValue({ from: () => ({ where }) } as never);

    const res = await GET(makeRequest('conv-1'));
    const body = await res.json() as { files: string[] };

    expect(res.status).toBe(200);
    expect(body.files).toEqual(['src/index.ts']);
    expect(listAllSandboxFiles).toHaveBeenCalledWith('sbx-1');
    // The lookup must be scoped to the caller's user id (IDOR prevention).
    expect(queryParams(where.mock.calls[0]?.[0])).toContain('user-1');
  });

  it('returns an empty list when the conversation belongs to someone else', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'user-1' } });
    const where = vi.fn(async () => []);
    vi.mocked(db.select).mockReturnValue({ from: () => ({ where }) } as never);

    const res = await GET(makeRequest('conv-other-user'));
    const body = await res.json() as { files: string[] };

    expect(res.status).toBe(200);
    expect(body.files).toEqual([]);
    expect(queryParams(where.mock.calls[0]?.[0])).toContain('user-1');
    expect(listAllSandboxFiles).not.toHaveBeenCalled();
  });
});
