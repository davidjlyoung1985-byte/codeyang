import * as v8 from 'node:v8';

/**
 * Memory monitoring utilities
 */

export interface MemoryStats {
  rss: string;
  heapTotal: string;
  heapUsed: string;
  external: string;
  heapUsedPercent: number;
  timestamp: number;
}

export interface MemorySnapshot {
  current: MemoryStats;
  baseline?: MemoryStats;
  delta?: {
    rss: number;
    heapUsed: number;
  };
}

/**
 * Get current memory usage statistics
 */
export function getMemoryUsage(): MemoryStats {
  const usage = process.memoryUsage();
  const heapUsedPercent = Math.round((usage.heapUsed / usage.heapTotal) * 100);

  return {
    rss: formatBytes(usage.rss),
    heapTotal: formatBytes(usage.heapTotal),
    heapUsed: formatBytes(usage.heapUsed),
    external: formatBytes(usage.external),
    heapUsedPercent,
    timestamp: Date.now(),
  };
}

/**
 * Get detailed V8 heap statistics
 */
export function getHeapStatistics() {
  const stats = v8.getHeapStatistics();
  return {
    totalHeapSize: formatBytes(stats.total_heap_size),
    totalHeapSizeExecutable: formatBytes(stats.total_heap_size_executable),
    totalPhysicalSize: formatBytes(stats.total_physical_size),
    totalAvailableSize: formatBytes(stats.total_available_size),
    usedHeapSize: formatBytes(stats.used_heap_size),
    heapSizeLimit: formatBytes(stats.heap_size_limit),
    mallocedMemory: formatBytes(stats.malloced_memory),
    peakMallocedMemory: formatBytes(stats.peak_malloced_memory),
  };
}

/**
 * Create a memory snapshot with baseline comparison
 */
export function createMemorySnapshot(baseline?: MemoryStats): MemorySnapshot {
  const current = getMemoryUsage();

  if (!baseline) {
    return { current };
  }

  // Calculate deltas in MB
  const currentRssBytes = parseBytes(current.rss);
  const baselineRssBytes = parseBytes(baseline.rss);
  const currentHeapBytes = parseBytes(current.heapUsed);
  const baselineHeapBytes = parseBytes(baseline.heapUsed);

  return {
    current,
    baseline,
    delta: {
      rss: Math.round((currentRssBytes - baselineRssBytes) / 1024 / 1024),
      heapUsed: Math.round((currentHeapBytes - baselineHeapBytes) / 1024 / 1024),
    },
  };
}

/**
 * Monitor memory usage over time
 */
export class MemoryMonitor {
  private samples: MemoryStats[] = [];
  private maxSamples: number;
  private intervalId?: NodeJS.Timeout;

  constructor(maxSamples = 100) {
    this.maxSamples = maxSamples;
  }

  /**
   * Start continuous monitoring
   */
  start(intervalMs = 5000): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.sample();
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Take a single memory sample
   */
  sample(): MemoryStats {
    const stats = getMemoryUsage();
    this.samples.push(stats);

    // Keep only last N samples
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    return stats;
  }

  /**
   * Get all samples
   */
  getSamples(): MemoryStats[] {
    return this.samples;
  }

  /**
   * Get memory statistics summary
   */
  getSummary() {
    if (this.samples.length === 0) {
      return null;
    }

    const heapUsedValues = this.samples.map((s) => parseBytes(s.heapUsed));
    const rssValues = this.samples.map((s) => parseBytes(s.rss));

    return {
      samples: this.samples.length,
      heapUsed: {
        current: formatBytes(heapUsedValues[heapUsedValues.length - 1] || 0),
        min: formatBytes(Math.min(...heapUsedValues)),
        max: formatBytes(Math.max(...heapUsedValues)),
        avg: formatBytes(heapUsedValues.reduce((a, b) => a + b, 0) / heapUsedValues.length),
      },
      rss: {
        current: formatBytes(rssValues[rssValues.length - 1] || 0),
        min: formatBytes(Math.min(...rssValues)),
        max: formatBytes(Math.max(...rssValues)),
        avg: formatBytes(rssValues.reduce((a, b) => a + b, 0) / rssValues.length),
      },
    };
  }

  /**
   * Clear all samples
   */
  clear(): void {
    this.samples = [];
  }

  /**
   * Check if memory usage is growing (potential leak)
   */
  isMemoryGrowing(threshold = 1.5): boolean {
    if (this.samples.length < 10) {
      return false; // Need more samples
    }

    const firstTen = this.samples.slice(0, 10);
    const lastTen = this.samples.slice(-10);

    const avgFirst = firstTen.reduce((sum, s) => sum + parseBytes(s.heapUsed), 0) / 10;
    const avgLast = lastTen.reduce((sum, s) => sum + parseBytes(s.heapUsed), 0) / 10;

    return avgLast / avgFirst > threshold;
  }
}

/**
 * Force garbage collection (if --expose-gc flag is set)
 */
export function forceGC(): boolean {
  if (global.gc) {
    global.gc();
    return true;
  }
  return false;
}

/**
 * Get memory leak candidates (large objects in heap)
 */
export function getMemoryLeakCandidates(): string[] {
  try {
    const heapSnapshot = v8.writeHeapSnapshot();
    return [`Heap snapshot written to: ${heapSnapshot}`, 'Analyze with Chrome DevTools Memory Profiler'];
  } catch (err) {
    return ['Heap snapshot failed: ' + (err instanceof Error ? err.message : String(err))];
  }
}

// ── Utility Functions ──────────────────────────────────────────

function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${Math.round(mb)}MB`;
}

function parseBytes(formatted: string): number {
  const match = formatted.match(/^(\d+)MB$/);
  if (!match) return 0;
  return parseInt(match[1], 10) * 1024 * 1024;
}
