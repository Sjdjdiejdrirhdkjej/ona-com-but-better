import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { performHealthCheck, getReadinessStatus } from '@/libs/HealthCheck';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const health = await performHealthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;
    
    return NextResponse.json(health, { 
      status: statusCode,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      }
    });
  } catch (error) {
    return NextResponse.json(
      { 
        status: 'unhealthy', 
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }, 
      { status: 503 }
    );
  }
}
