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
    onStream?: (event: 'first-token' | 'chunk' | 'done') => void,
    signal?: AbortSignal,
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
        abortSignal: signal,
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
      abortSignal: signal,
    });

    let firstTokenRecorded = false;

    try {
      for await (const _chunk of result.textStream) {
        if (!firstTokenRecorded) {
          collector.recordFirstToken(runId);
          firstTokenRecorded = true;
          onStream?.('first-token');
        }
        onStream?.('chunk');
      }

      const usage = await result.usage;
      const tokens =
        typeof usage.outputTokens === 'number'
          ? usage.outputTokens
          : (usage.outputTokens as any)?.total ?? 0;
      collector.recordChunk(runId, tokens);
      onStream?.('done');
    } catch (_err) {}

    return collector.finishRun(runId);
  },
};
