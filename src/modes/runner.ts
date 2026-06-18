import type { SpeedTestConfig, RunMetrics, StreamTraceEvent } from '../types.js';
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
    onStream?: (event: 'first-token' | 'chunk' | 'done', tokenCount?: number) => void,
    onTrace?: (event: StreamTraceEvent) => void,
    signal?: AbortSignal,
  ): Promise<RunMetrics>;
}
