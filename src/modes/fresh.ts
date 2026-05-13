import type { SpeedTestConfig, RunMetrics } from '../types.js';
import type { MetricsCollector } from '../metrics.js';
import type { LanguageModel } from 'ai';
import type { ModeRunner } from './runner.js';
import { streamText } from 'ai';

const FRESH_PROMPT =
  'Write a comprehensive, detailed essay about the history and evolution of computing, from the abacus to modern AI. Include specific dates, key figures, and technical milestones. Be thorough and expansive.';

export const freshRunner: ModeRunner = {
  name: 'fresh',
  description: 'Fresh conversation with no history — measures cold-start TTFT and throughput',

  async run(
    config: SpeedTestConfig,
    model: LanguageModel,
    metricsFactory: () => MetricsCollector,
    _context: string,
    onStream?: (event: 'first-token' | 'chunk' | 'done') => void,
    signal?: AbortSignal,
  ): Promise<RunMetrics> {
    const collector = metricsFactory();
    const runId = collector.startRun();

    let firstChunkReceived = false;

    const result = streamText({
      model,
      prompt: FRESH_PROMPT,
      maxOutputTokens: config.maxTokens,
      maxRetries: 0,
      abortSignal: signal,
      onChunk: ({ chunk }) => {
        if (!firstChunkReceived && chunk.type === 'text-delta') {
          firstChunkReceived = true;
          collector.recordFirstToken(runId);
          onStream?.('first-token');
        }
        if (chunk.type === 'text-delta') {
          onStream?.('chunk');
        }
      },
      onFinish: () => {
        onStream?.('done');
      },
    });

    try {
      await result.consumeStream();
      const usage = await result.usage;
      const tokens =
        typeof usage.outputTokens === 'number'
          ? usage.outputTokens
          : (usage.outputTokens as any)?.total ?? 0;
      console.error('[DEBUG fresh] result.usage:', JSON.stringify(usage));
      console.error('[DEBUG fresh] tokens:', tokens);
      collector.recordChunk(runId, tokens);
    } catch (_err) {}

    return collector.finishRun(runId);
  },
};
