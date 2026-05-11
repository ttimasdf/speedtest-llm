import type { SpeedTestConfig, RunMetrics } from '../types.js';
import type { MetricsCollector } from '../metrics.js';
import type { LanguageModel } from 'ai';

export interface ModeRunner {
  readonly name: string;
  readonly description: string;
  run(
    config: SpeedTestConfig,
    model: LanguageModel,
    metricsFactory: () => MetricsCollector,
    context: string,
  ): Promise<RunMetrics>;
}
