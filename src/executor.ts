import type { SpeedTestConfig, RunMetrics, AggregateMetrics, SpeedTestResult, IntervalSnapshot, ThreadStreamState, PercentileStats } from './types.js';
import { createProvider } from './providers/factory.js';
import { getRunner } from './modes/registry.js';
import { createMetricsCollector, computeAggregates, computeStats } from './metrics.js';
import { loadContext } from './context-loader.js';
import { createIntervalTracker } from './interval-tracker.js';

export interface ExecuteOptions {
  onInterval?: (snapshot: IntervalSnapshot) => void;
}

function computeIntervalStats(intervals: readonly IntervalSnapshot[]): { intervalTps: PercentileStats; totalIntervals: number } {
  const nonOmitted = intervals.filter(i => !i.omitted);
  const tpsValues = nonOmitted.map(i => i.tps);

  return {
    intervalTps: tpsValues.length > 0 ? computeStats(tpsValues) : { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 },
    totalIntervals: intervals.length,
  };
}

export async function executeParallel(config: SpeedTestConfig, options?: ExecuteOptions): Promise<SpeedTestResult> {
  const runner = getRunner(config.mode);
  const model = createProvider(config);
  const context = await loadContext(config.contextFile);
  const tracker = createIntervalTracker({
    intervalMs: config.interval * 1000,
    omitMs: config.omit * 1000,
    threadCount: config.threads,
  });

  const allIntervals: IntervalSnapshot[] = [];
  const allThreadStates: ThreadStreamState[][] = [];

  function captureSnapshot(snapshot: IntervalSnapshot) {
    allIntervals.push(snapshot);
    allThreadStates.push(tracker.getThreadStates());
    options?.onInterval?.(snapshot);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  const threadPromises = Array.from({ length: config.threads }, async (_, i) => {
    if (config.rampUp > 0 && i > 0) {
      await new Promise(resolve => setTimeout(resolve, config.rampUp * 1000 * i));
    }

    // Each thread gets its own collector — not shared, not thread-safe
    const metricsFactory = () => createMetricsCollector();

    const onStream = (event: 'first-token' | 'chunk' | 'done') => {
      tracker.onStreamEvent(i, event);
    };

    return runner.run(config, model, metricsFactory, context, onStream, controller.signal);
  });

  const tickInterval = setInterval(() => {
    const now = performance.now();
    let snapshot: IntervalSnapshot | null;
    while ((snapshot = tracker.tick(now)) !== null) {
      captureSnapshot(snapshot);
    }
  }, 100);

  const outcomes = await Promise.allSettled(threadPromises);

  clearInterval(tickInterval);
  clearTimeout(timeoutId);

  const now = performance.now();
  const remainingSnapshots = tracker.finalize(now);
  for (const snapshot of remainingSnapshots) {
    captureSnapshot(snapshot);
  }

  const successes: RunMetrics[] = [];
  const errorMessages: string[] = [];

  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled') {
      successes.push(outcome.value);
    } else {
      errorMessages.push(
        outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      );
    }
  }

  const { intervalTps, totalIntervals } = computeIntervalStats(allIntervals);

  const aggregate: AggregateMetrics = successes.length > 0
    ? {
        ...computeAggregates(successes),
        threadCount: config.threads,
        successCount: successes.length,
        errorCount: errorMessages.length,
        intervalTps,
        totalIntervals,
      }
    : {
        ttft: { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 },
        tokensPerSecond: { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 },
        totalTime: { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 },
        totalTokens: 0,
        threadCount: config.threads,
        successCount: 0,
        errorCount: errorMessages.length,
        intervalTps,
        totalIntervals,
      };

  return {
    mode: config.mode,
    config,
    threads: successes,
    aggregate,
    errors: errorMessages,
    timestamp: new Date().toISOString(),
    intervals: allIntervals,
    threadStates: allThreadStates,
  };
}
