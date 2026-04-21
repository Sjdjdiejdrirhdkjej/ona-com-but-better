import { logger } from '@/libs/Logger';

interface MemorySnapshot {
  timestamp: number;
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
}

interface MemoryAlert {
  type: 'threshold' | 'growth' | 'leak-suspected';
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
}

const SNAPSHOT_COUNT = 60;
const CHECK_INTERVAL_MS = 60000;
const HEAP_GROWTH_THRESHOLD = 50 * 1024 * 1024;
const HEAP_PERCENTAGE_THRESHOLD = 85;
const LEAK_GROWTH_THRESHOLD = 10 * 1024 * 1024;

const snapshots: MemorySnapshot[] = [];
let lastCheckTime = 0;

export function captureMemorySnapshot(): MemorySnapshot {
  const usage = process.memoryUsage();
  const snapshot: MemorySnapshot = {
    timestamp: Date.now(),
    rss: usage.rss,
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers ?? 0,
  };

  snapshots.push(snapshot);
  if (snapshots.length > SNAPSHOT_COUNT) {
    snapshots.shift();
  }

  return snapshot;
}

export function getMemorySnapshots(): MemorySnapshot[] {
  return [...snapshots];
}

export function getLatestSnapshot(): MemorySnapshot | null {
  return snapshots.length > 0 ? snapshots[snapshots.length - 1]! : null;
}

export function calculateGrowthRate(): number {
  if (snapshots.length < 2) return 0;

  const first = snapshots[0]!;
  const last = snapshots[snapshots.length - 1]!;
  const timeDelta = last.timestamp - first.timestamp;

  if (timeDelta === 0) return 0;

  const bytesPerMs = (last.heapUsed - first.heapUsed) / timeDelta;
  return bytesPerMs * 1000;
}

export function checkMemoryThresholds(): MemoryAlert[] {
  const alerts: MemoryAlert[] = [];
  const current = captureMemorySnapshot();

  const heapUsagePercent = (current.heapUsed / current.heapTotal) * 100;
  if (heapUsagePercent > HEAP_PERCENTAGE_THRESHOLD) {
    alerts.push({
      type: 'threshold',
      message: `Heap usage at ${heapUsagePercent.toFixed(1)}% exceeds ${HEAP_PERCENTAGE_THRESHOLD}%`,
      value: current.heapUsed,
      threshold: (HEAP_PERCENTAGE_THRESHOLD / 100) * current.heapTotal,
      timestamp: current.timestamp,
    });
  }

  if (snapshots.length >= 10) {
    const growth = calculateGrowthRate();
    if (growth > 0) {
      const projectedGrowth = growth * 60;
      if (projectedGrowth > LEAK_GROWTH_THRESHOLD) {
        alerts.push({
          type: 'growth',
          message: `Memory growing at ${(growth / 1024 / 1024).toFixed(2)} MB/s, potential leak suspected`,
          value: growth,
          threshold: LEAK_GROWTH_THRESHOLD / 60,
          timestamp: current.timestamp,
        });
      }
    }
  }

  if (snapshots.length >= 30) {
    const oldest = snapshots[0]!;
    const totalGrowth = current.heapUsed - oldest.heapUsed;
    const timeSpanMinutes = (current.timestamp - oldest.timestamp) / 60000;

    if (timeSpanMinutes >= 30 && totalGrowth > HEAP_GROWTH_THRESHOLD) {
      alerts.push({
        type: 'leak-suspected',
        message: `Heap grew by ${(totalGrowth / 1024 / 1024).toFixed(2)} MB over ${Math.round(timeSpanMinutes)} minutes`,
        value: totalGrowth,
        threshold: HEAP_GROWTH_THRESHOLD,
        timestamp: current.timestamp,
      });
    }
  }

  return alerts;
}

export function startMemoryMonitoring(): void {
  if (typeof process === 'undefined' || !process.memoryUsage) {
    logger.warn('Memory monitoring not available in this environment');
    return;
  }

  setInterval(() => {
    const alerts = checkMemoryThresholds();
    for (const alert of alerts) {
      if (alert.type === 'leak-suspected') {
        logger.error('MEMORY ALERT:', alert.message, {
          type: alert.type,
          value: alert.value,
          threshold: alert.threshold,
        });
      } else {
        logger.warn('MEMORY ALERT:', alert.message, {
          type: alert.type,
          value: alert.value,
          threshold: alert.threshold,
        });
      }
    }
  }, CHECK_INTERVAL_MS);

  logger.info('Memory monitoring started');
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

export function getMemoryStats(): {
  current: MemorySnapshot | null;
  growthRate: number;
  snapshots: MemorySnapshot[];
  alerts: MemoryAlert[];
} {
  return {
    current: getLatestSnapshot(),
    growthRate: calculateGrowthRate(),
    snapshots: [...snapshots],
    alerts: checkMemoryThresholds(),
  };
}
