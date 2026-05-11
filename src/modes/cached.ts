import type { SpeedTestConfig, RunMetrics } from '../types.js';
import type { MetricsCollector } from '../metrics.js';
import type { LanguageModel } from 'ai';
import type { ModeRunner } from './runner.js';
import { streamText } from 'ai';

export const cachedRunner: ModeRunner = {
  name: 'cached-long-context',
  description: 'Measures cached long-context generation speed (warmup + measured run)',

  async run(
    config: SpeedTestConfig,
    model: LanguageModel,
    metricsFactory: () => MetricsCollector,
    context: string,
  ): Promise<RunMetrics> {
    const prompt =
      context +
      '\n\nWrite a comprehensive, detailed essay about the history and evolution of computing, from the abacus to modern AI. Include specific dates, key figures, and technical milestones. Be thorough and expansive.';
    const messages = [{ role: 'user' as const, content: prompt }];

    try {
      const warmup = streamText({
        model,
        messages,
        maxOutputTokens: config.maxTokens,
        maxRetries: 0,
      });
      for await (const _chunk of warmup.textStream) {}
    } catch (err) {
      console.warn(
        'Warmup request failed (some endpoints may not support caching):',
        err instanceof Error ? err.message : String(err),
      );
    }

    const collector = metricsFactory();
    const runId = collector.startRun();

    const result = streamText({
      model,
      messages,
      maxOutputTokens: config.maxTokens,
      maxRetries: 0,
    });

    let firstTokenRecorded = false;

    for await (const _chunk of result.textStream) {
      if (!firstTokenRecorded) {
        collector.recordFirstToken(runId);
        firstTokenRecorded = true;
      }
    }

    const usage = await result.usage;
    collector.recordChunk(runId, usage.outputTokens ?? 0);

    return collector.finishRun(runId);
  },
};
