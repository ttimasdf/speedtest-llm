import type { SpeedTestConfig, RunMetrics, AggregateMetrics, SpeedTestResult, IntervalSnapshot, ThreadStreamState, PercentileStats } from './types.js';
import { createProvider } from './providers/factory.js';
import { getRunner } from './modes/registry.js';
import { createMetricsCollector, computeAggregates, computeStats } from './metrics.js';
import { loadContext } from './context-loader.js';
import { createIntervalTracker } from './interval-tracker.js';
import { createTraceCollector } from './tracing.js';

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
  const vlog = (msg: string) => { if (config.verbose) console.error(`[executor] ${msg}`); };

  vlog(`starting: mode=${config.mode} threads=${config.threads} timeout=${config.timeout}ms interval=${config.interval}s omit=${config.omit}s`);

  const runner = getRunner(config.mode);
  const model = createProvider(config);
  const context = await loadContext(config.contextFile);
  const tracker = createIntervalTracker({
    intervalMs: config.interval * 1000,
    omitMs: config.omit * 1000,
    threadCount: config.threads,
  }, config.verbose);
  const traces = createTraceCollector(config);

  const allIntervals: IntervalSnapshot[] = [];
  const allThreadStates: ThreadStreamState[][] = [];

  function captureSnapshot(snapshot: IntervalSnapshot) {
    allIntervals.push(snapshot);
    allThreadStates.push(tracker.getThreadStates());
    options?.onInterval?.(snapshot);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    vlog(`timeout reached (${config.timeout}ms), aborting all threads`);
    controller.abort();
  }, config.timeout);

  const startTime = performance.now();
  let threadsSpawned = 0;

  const threadPromises = Array.from({ length: config.threads }, async (_, i) => {
    if (controller.signal.aborted) {
      throw new Error('Thread start skipped: timeout reached');
    }
    threadsSpawned++;
    vlog(`T${i} spawned (${threadsSpawned}/${config.threads} total started, +${((performance.now() - startTime) / 1000).toFixed(2)}s)`);

    // Each thread gets its own collector — not shared, not thread-safe
    const metricsFactory = () => createMetricsCollector(config.verbose);

    const onStream = (event: 'first-token' | 'chunk' | 'done') => {
      tracker.onStreamEvent(i, event, performance.now());
    };

    vlog(`T${i} starting run`);
    try {
      const result = await runner.run(
        config,
        model,
        metricsFactory,
        context,
        onStream,
        (event) => traces.record(i, event),
        controller.signal,
      );
      vlog(`T${i} completed: ttft=${(result.ttft / 1000).toFixed(3)}s tok/s=${result.tokensPerSecond.toFixed(1)} tokens=${result.totalTokens}`);
      return result;
    } catch (err) {
      vlog(`T${i} error: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  });

  const tickInterval = setInterval(() => {
    const now = performance.now();
    let snapshot: IntervalSnapshot | null;
    while ((snapshot = tracker.tick(now)) !== null) {
      captureSnapshot(snapshot);
    }
  }, 100);

  vlog('all threads spawned, waiting for completion...');
  const outcomes = await Promise.allSettled(threadPromises);
  await traces.flush();

  clearInterval(tickInterval);
  clearTimeout(timeoutId);

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
  vlog(`all threads settled in ${elapsed}s`);

  const now = performance.now();
  const remainingSnapshots = tracker.finalize(now);
  vlog(`finalize produced ${remainingSnapshots.length} snapshots`);
  for (const snapshot of remainingSnapshots) {
    captureSnapshot(snapshot);
  }

  const successes: RunMetrics[] = [];
  const errorMessages: string[] = [];

  for (let i = 0; i < outcomes.length; i++) {
    const outcome = outcomes[i];
    if (outcome.status === 'fulfilled') {
      successes.push(outcome.value);
    } else {
      const msg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      vlog(`T${i} failed: ${msg}`);
      errorMessages.push(msg);
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
    traces: config.traceOutput === 'memory' ? traces.getRecords() : undefined,
  };
}
