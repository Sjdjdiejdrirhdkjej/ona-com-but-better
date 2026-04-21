import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { performHealthCheck, getReadinessStatus } from '@/libs/HealthCheck';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const health = await performHealthCheck();
    const readiness = getReadinessStatus(health);
    
    const statusCode = readiness.ready ? 200 : 503;
    
    return NextResponse.json(
      { 
        ready: readiness.ready,
        reason: readiness.reason,
        timestamp: new Date().toISOString(),
        checks: {
          database: health.checks.database.status,
          superAgent: health.checks.superAgent.status,
        },
      }, 
      { 
        status: statusCode,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      { 
        ready: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }, 
      { status: 503 }
    );
  }
}
