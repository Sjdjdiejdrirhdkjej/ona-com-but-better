import { db } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import { agentJobsSchema, conversationSuperAgentsSchema } from '@/models/Schema';
import { eq, and, lte } from 'drizzle-orm';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export type HealthCheckResult = {
  status: HealthStatus;
  timestamp: string;
  checks: {
    database: {
      status: HealthStatus;
      responseTime: number;
      message?: string;
    };
    superAgent: {
      status: HealthStatus;
      activeJobs: number;
      dueHeartbeats: number;
      message?: string;
    };
    externalApis: {
      fireworks: { status: HealthStatus; message?: string };
      daytona: { status: HealthStatus; message?: string };
    };
  };
  uptime: number;
  version: string;
};

const START_TIME = Date.now();
const HEALTH_CHECK_TIMEOUT = 5000;

async function checkDatabase(): Promise<{ status: HealthStatus; responseTime: number; message?: string }> {
  const start = Date.now();
  try {
    await Promise.race([
      db.execute('SELECT 1'),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database check timeout')), HEALTH_CHECK_TIMEOUT)
      ),
    ]);
    return { status: 'healthy', responseTime: Date.now() - start };
  } catch (error) {
    return { 
      status: 'unhealthy', 
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function checkSuperAgent(): Promise<{ status: HealthStatus; activeJobs: number; dueHeartbeats: number; message?: string }> {
  try {
    const now = new Date();
    const [activeJobsResult, dueHeartbeatsResult] = await Promise.all([
      db.select().from(agentJobsSchema).where(eq(agentJobsSchema.status, 'running')),
      db.select()
        .from(conversationSuperAgentsSchema)
        .where(and(
          eq(conversationSuperAgentsSchema.enabled, true),
          lte(conversationSuperAgentsSchema.nextHeartbeatAt, now)
        )),
    ]);

    const activeJobs = activeJobsResult.length;
    const dueHeartbeats = dueHeartbeatsResult.length;

    let status: HealthStatus = 'healthy';
    if (activeJobs > 10 || dueHeartbeats > 50) {
      status = 'degraded';
    }

    return { status, activeJobs, dueHeartbeats };
  } catch (error) {
    logger.error('SuperAgent health check failed:', error);
    return { 
      status: 'unhealthy', 
      activeJobs: 0, 
      dueHeartbeats: 0,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function checkFireworks(): Promise<{ status: HealthStatus; message?: string }> {
  try {
    const response = await fetch('https://api.fireworks.ai/health', {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      return { status: 'healthy' };
    }
    return { status: 'degraded', message: `HTTP ${response.status}` };
  } catch {
    return { status: 'degraded', message: 'Unable to reach Fireworks AI' };
  }
}

async function checkDaytona(): Promise<{ status: HealthStatus; message?: string }> {
  try {
    const daytonaApiKey = process.env.DAYTONA_API_KEY;
    if (!daytonaApiKey) {
      return { status: 'healthy', message: 'DAYTONA_API_KEY not configured - skipping check' };
    }

    const response = await fetch('https://api.daytona.io/health', {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      return { status: 'healthy' };
    }
    return { status: 'degraded', message: `HTTP ${response.status}` };
  } catch {
    return { status: 'degraded', message: 'Unable to reach Daytona API' };
  }
}

export async function performHealthCheck(): Promise<HealthCheckResult> {
  const [dbCheck, superAgentCheck, fireworksCheck, daytonaCheck] = await Promise.all([
    checkDatabase(),
    checkSuperAgent(),
    checkFireworks(),
    checkDaytona(),
  ]);

  let overallStatus: HealthStatus = 'healthy';
  if (dbCheck.status === 'unhealthy') {
    overallStatus = 'unhealthy';
  } else if (dbCheck.status === 'degraded' || superAgentCheck.status === 'degraded' || 
             fireworksCheck.status === 'degraded' || daytonaCheck.status === 'degraded') {
    overallStatus = 'degraded';
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks: {
      database: dbCheck,
      superAgent: superAgentCheck,
      externalApis: {
        fireworks: fireworksCheck,
        daytona: daytonaCheck,
      },
    },
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    version: process.env.npm_package_version || 'unknown',
  };
}

export function getReadinessStatus(healthResult: HealthCheckResult): { ready: boolean; reason?: string } {
  if (healthResult.status === 'unhealthy') {
    return { ready: false, reason: 'Service is unhealthy' };
  }
  if (healthResult.checks.database.status === 'unhealthy') {
    return { ready: false, reason: 'Database is unavailable' };
  }
  return { ready: true };
}
