import type { NextRequest } from 'next/server';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { agentEventsSchema, agentJobsSchema } from '@/models/Schema';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const url = new URL(req.url);
  const after = Number(url.searchParams.get('after') ?? '0');

  const jobs = await db.select().from(agentJobsSchema).where(eq(agentJobsSchema.id, jobId));
  if (!jobs[0]) {
    return Response.json({ error: 'Job not found' }, { status: 404 });
  }

  const job = jobs[0];

  const events = await db
    .select()
    .from(agentEventsSchema)
    .where(
      and(
        eq(agentEventsSchema.jobId, jobId),
        gt(agentEventsSchema.id, after),
      ),
    )
    .orderBy(agentEventsSchema.id);

  return Response.json({
    events: events.map(e => ({
      id: e.id,
      type: e.type,
      data: (() => {
        try {
          return JSON.parse(e.data);
        } catch {
          return {};
        }
      })(),
    })),
    done: job.status !== 'running',
    status: job.status,
  });
}
