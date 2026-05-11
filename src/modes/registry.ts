import { prefillRunner } from './prefill.js';
import { freshRunner } from './fresh.js';
import { cachedRunner } from './cached.js';
import type { SpeedTestMode, SpeedTestConfig, RunMetrics } from '../types.js';
import type { MetricsCollector } from '../metrics.js';
import type { LanguageModel } from 'ai';
import type { ModeRunner } from './runner.js';

const registry = new Map<SpeedTestMode, ModeRunner>();

registerRunner('prefill', prefillRunner);

export function registerRunner(mode: SpeedTestMode, runner: ModeRunner): void {
  registry.set(mode, runner);
}

registerRunner('fresh', freshRunner);
registerRunner('cached-long-context', cachedRunner);

export function getRunner(mode: SpeedTestMode): ModeRunner {
  const runner = registry.get(mode);
  if (!runner) {
    throw new Error(
      `Unknown speed test mode: ${mode}. Available: fresh, cached-long-context, prefill`,
    );
  }
  return runner;
}
