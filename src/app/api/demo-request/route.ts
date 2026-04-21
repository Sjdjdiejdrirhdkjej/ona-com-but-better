import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import { demoRequestsSchema } from '@/models/Schema';

const formSchema = z.object({
  email: z.string().email().max(254),
  company: z.string().min(1).max(200),
  size: z.string().max(100).optional().default(''),
  notes: z.string().max(2000).optional().default(''),
});

async function readPayload(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return request.json();
  }
  const form = await request.formData();
  return Object.fromEntries(form.entries());
}

function wantsJson(request: Request) {
  const accept = request.headers.get('accept') ?? '';
  const contentType = request.headers.get('content-type') ?? '';
  return accept.includes('application/json') || contentType.includes('application/json');
}

function redirectBack(request: Request, status: 'ok' | 'error') {
  const origin = new URL(request.url).origin;
  const target = new URL('/demo', origin);
  target.searchParams.set('submitted', status);
  return NextResponse.redirect(target, { status: 303 });
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await readPayload(request);
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = formSchema.safeParse(raw);
  if (!parsed.success) {
    if (wantsJson(request)) {
      return NextResponse.json({ error: 'Invalid form input', details: parsed.error.flatten() }, { status: 400 });
    }
    return redirectBack(request, 'error');
  }

  try {
    const db = await getDb();
    await db.insert(demoRequestsSchema).values({
      email: parsed.data.email,
      company: parsed.data.company,
      size: parsed.data.size ?? '',
      notes: parsed.data.notes ?? '',
    });
  } catch (error) {
    logger.error('Failed to save demo request', error);
    if (wantsJson(request)) {
      return NextResponse.json({ error: 'Could not save request' }, { status: 500 });
    }
    return redirectBack(request, 'error');
  }

  if (wantsJson(request)) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }
  return redirectBack(request, 'ok');
}
