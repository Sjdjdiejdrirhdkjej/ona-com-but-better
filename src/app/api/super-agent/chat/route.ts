import type { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod/v4';
import { db } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import { authFailureResponse, getRequestAuth, isAuthFailure, requireApiKeyScope } from '@/libs/ApiKeys';
import { runOpencode } from '@/libs/OpencodeAgent';
import { agentEventsSchema, agentJobsSchema, conversationsSchema, messagesSchema } from '@/models/Schema';

export const runtime = 'nodejs';

const requestSchema = z.object({
  conversationId: z.string().min(1),
  message: z.string().min(1),
  assistantMessageId: z.string().min(1).optional(),
  jobId: z.string().uuid().optional(),
});

function sseEvent(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

async function persistJobEvent(jobId: string, type: string, data: Record<string, unknown> = {}) {
  try {
    await db.insert(agentEventsSchema).values({ jobId, type, data: JSON.stringify(data) });
  } catch (err) {
    logger.warn({ err, jobId, type }, 'persistJobEvent: failed to persist event');
  }
}

async function markJobStatus(jobId: string, status: 'done' | 'error') {
  try {
    await db.update(agentJobsSchema).set({ status }).where(eq(agentJobsSchema.id, jobId));
  } catch (err) {
    logger.warn({ err, jobId, status }, 'markJobStatus: failed to update job status');
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map(i => i.message).join('; ') }, { status: 400 });
  }

  const secret = process.env.SUPER_AGENT_HEARTBEAT_SECRET;
  const isInternal = Boolean(secret && req.headers.get('x-ona-heartbeat-secret') === secret);

  let userId: string | null = null;
  if (!isInternal) {
    const auth = await getRequestAuth(req);
    if (isAuthFailure(auth)) return authFailureResponse(auth);
    if (!auth) return Response.json({ error: 'Authentication required.' }, { status: 401 });
    const scopeFailure = requireApiKeyScope(auth, 'task_running');
    if (scopeFailure) return authFailureResponse(scopeFailure);
    userId = auth.userId;
  }

  const { conversationId, message, assistantMessageId, jobId: clientJobId } = parsed.data;

  let [conversation] = await db
    .select({ id: conversationsSchema.id, userId: conversationsSchema.userId })
    .from(conversationsSchema)
    .where(
      userId
        ? and(eq(conversationsSchema.id, conversationId), eq(conversationsSchema.userId, userId))
        : eq(conversationsSchema.id, conversationId),
    )
    .limit(1);

  if (!conversation) {
    // Auto-create when an authenticated user posts to a fresh conversation id.
    // This makes the super-agent flow self-healing if the explicit
    // POST /api/conversations call was lost (e.g. earlier 500s left a stale
    // id in the URL).
    if (!userId) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }
    try {
      await db.insert(conversationsSchema).values({
        id: conversationId,
        title: message.slice(0, 80) || 'New task',
        userId,
      });
      conversation = { id: conversationId, userId };
    } catch (err) {
      logger.error('Failed to auto-create super-agent conversation', err);
      return Response.json({ error: 'Could not initialize conversation.' }, { status: 500 });
    }
  }

  // Persist the user message before kicking off the agent so it survives
  // even if the SSE connection drops mid-run.
  try {
    await db.insert(messagesSchema).values({
      id: crypto.randomUUID(),
      conversationId,
      role: 'user',
      content: message,
    });
  } catch (err) {
    logger.warn('Failed to persist user message', err);
  }

  const finalAssistantId = assistantMessageId ?? crypto.randomUUID();
  let jobId: string | null = clientJobId ?? crypto.randomUUID();

  try {
    await db.insert(agentJobsSchema).values({ id: jobId, conversationId, status: 'running' });
  } catch (err) {
    logger.warn({ err, jobId, conversationId }, 'Failed to create super-agent job; continuing with SSE only');
    jobId = null;
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let assistantText = '';
      let errored = false;

      controller.enqueue(enc.encode(sseEvent({ type: 'assistant_msg_id', messageId: finalAssistantId })));
      if (jobId) {
        controller.enqueue(enc.encode(sseEvent({ type: 'job_id', jobId })));
      }

      try {
        for await (const event of runOpencode({ conversationId, message })) {
          if (event.type === 'session') {
            controller.enqueue(enc.encode(sseEvent({ type: 'session', sessionID: event.sessionID })));
          } else if (event.type === 'text') {
            assistantText += event.text;
            controller.enqueue(enc.encode(sseEvent({ delta: event.text })));
            if (jobId && event.text) {
              await persistJobEvent(jobId, 'content', { text: event.text });
            }
          } else if (event.type === 'tool_start') {
            controller.enqueue(enc.encode(sseEvent({ type: 'tool_start', tool: event.tool })));
          } else if (event.type === 'tool_finish') {
            controller.enqueue(enc.encode(sseEvent({ type: 'tool_finish', tool: event.tool })));
          } else if (event.type === 'error') {
            errored = true;
            controller.enqueue(enc.encode(sseEvent({ type: 'error', message: event.message })));
            if (jobId) {
              await persistJobEvent(jobId, 'error', { message: event.message });
            }
          }
        }

        if (assistantText.trim().length > 0) {
          try {
            await db.insert(messagesSchema).values({
              id: finalAssistantId,
              conversationId,
              role: 'assistant',
              content: assistantText,
            });
            await db
              .update(conversationsSchema)
              .set({ updatedAt: new Date() })
              .where(eq(conversationsSchema.id, conversationId));
          } catch (err) {
            logger.error('Failed to persist assistant message', err);
          }
        }

        if (jobId) {
          await persistJobEvent(jobId, 'done', {});
          await markJobStatus(jobId, errored ? 'error' : 'done');
        }
        controller.enqueue(enc.encode(sseEvent({ type: 'done', error: errored })));
        controller.enqueue(enc.encode('data: [DONE]\n\n'));
      } catch (err) {
        controller.enqueue(enc.encode(sseEvent({ type: 'error', message: (err as Error).message })));
        if (jobId) {
          await persistJobEvent(jobId, 'error', { message: (err as Error).message });
          await markJobStatus(jobId, 'error');
        }
        controller.enqueue(enc.encode('data: [DONE]\n\n'));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
