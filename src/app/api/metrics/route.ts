import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { captureMemorySnapshot, getMemoryStats, formatBytes } from '@/libs/MemoryMonitor';
import { getAllCircuitBreakerMetrics } from '@/libs/CircuitBreaker';
import { getShutdownStatus } from '@/libs/GracefulShutdown';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Metric {
  name: string;
  value: number | string | object;
  type: 'gauge' | 'counter' | 'histogram';
  labels: Record<string, string>;
  timestamp: number;
}

const metrics: Metric[] = [];

function recordMetric(name: string, value: number | string | object, type: Metric['type'], labels: Record<string, string> = {}) {
  metrics.push({ name, value, type, labels, timestamp: Date.now() } as Metric);
}

export async function GET(_request: NextRequest) {
  const memoryStats = getMemoryStats();
  const circuitBreakers = getAllCircuitBreakerMetrics();
  const shutdownStatus = getShutdownStatus();
  const memSnapshot = captureMemorySnapshot();

  const output = {
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: {
      rss: memSnapshot.rss,
      rssFormatted: formatBytes(memSnapshot.rss),
      heapUsed: memSnapshot.heapUsed,
      heapUsedFormatted: formatBytes(memSnapshot.heapUsed),
      heapTotal: memSnapshot.heapTotal,
      heapTotalFormatted: formatBytes(memSnapshot.heapTotal),
      heapUsagePercent: memSnapshot.heapTotal > 0 ? ((memSnapshot.heapUsed / memSnapshot.heapTotal) * 100).toFixed(2) : '0',
      external: memSnapshot.external,
      arrayBuffers: memSnapshot.arrayBuffers,
    },
    memoryGrowth: {
      rateBytesPerSec: memoryStats.growthRate,
      rateFormatted: formatBytes(memoryStats.growthRate) + '/s',
      snapshotCount: memoryStats.snapshots.length,
    },
    circuitBreakers: circuitBreakers,
    shutdown: {
      isShuttingDown: shutdownStatus.shuttingDown,
      activeRequests: shutdownStatus.activeRequests,
      deadline: shutdownStatus.deadline,
    },
    activeRequests: shutdownStatus.activeRequests,
  };

  return NextResponse.json(output, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Type': 'application/json',
    },
  });
}

export function resetMetrics(): void {
  metrics.length = 0;
}