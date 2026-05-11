import type { SpeedTestConfig, RunMetrics, AggregateMetrics, SpeedTestResult } from './types.js';
import { createProvider } from './providers/factory.js';
import { getRunner } from './modes/registry.js';
import { createMetricsCollector, computeAggregates } from './metrics.js';
import { loadContext } from './context-loader.js';

export async function executeParallel(config: SpeedTestConfig): Promise<SpeedTestResult> {
  const runner = getRunner(config.mode);
  const model = createProvider(config);
  const context = await loadContext(config.contextFile);

  const threadPromises = Array.from({ length: config.threads }, async (_, i) => {
    if (config.rampUpMs > 0 && i > 0) {
      await new Promise(resolve => setTimeout(resolve, config.rampUpMs * i));
    }

    // Each thread gets its own collector — not shared, not thread-safe
    const metricsFactory = () => createMetricsCollector();

    return runner.run(config, model, metricsFactory, context);
  });

  const outcomes = await Promise.allSettled(threadPromises);

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

  const aggregate: AggregateMetrics = successes.length > 0
    ? {
        ...computeAggregates(successes),
        threadCount: config.threads,
        successCount: successes.length,
        errorCount: errorMessages.length,
      }
    : {
        ttft: { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 },
        tokensPerSecond: { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 },
        totalTime: { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 },
        totalTokens: 0,
        threadCount: config.threads,
        successCount: 0,
        errorCount: errorMessages.length,
      };

  return {
    mode: config.mode,
    config,
    threads: successes,
    aggregate,
    errors: errorMessages,
    timestamp: new Date().toISOString(),
  };
}
