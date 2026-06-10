import type { SpeedTestConfig, RunMetrics, StreamTraceEvent } from '../types.js';
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
    onTrace?: (event: StreamTraceEvent) => void,
    signal?: AbortSignal,
  ): Promise<RunMetrics> {
    const collector = metricsFactory();
    const runId = collector.startRun();

    let firstChunkReceived = false;
    let streamTokenCount = 0;

    onTrace?.({ event: 'stream_start' });

    const result = streamText({
      model,
      prompt: FRESH_PROMPT,
      maxOutputTokens: config.maxTokens,
      maxRetries: 0,
      abortSignal: signal,
      onChunk: ({ chunk }) => {
        if (chunk.type !== 'text-delta') {
          onTrace?.({ event: 'stream_chunk', blockType: chunk.type, block: chunk });
          return;
        }
        streamTokenCount += Math.max(1, Math.round(chunk.text.length / 4));
        if (!firstChunkReceived) {
          firstChunkReceived = true;
          collector.recordFirstToken(runId);
          onStream?.('first-token');
          onTrace?.({ event: 'stream_first_chunk', content: chunk.text, blockType: chunk.type });
        } else {
          onTrace?.({ event: 'stream_chunk', content: chunk.text, blockType: chunk.type });
        }
        onStream?.('chunk');
      },
      onFinish: () => {
        onStream?.('done');
      },
    });

    try {
      await result.consumeStream();
      let tokens = streamTokenCount;
      if (tokens === 0) {
        const usage = await result.usage;
        tokens =
          typeof usage.outputTokens === 'number'
            ? usage.outputTokens
            : (usage.outputTokens as any)?.total ?? 0;
      }
      collector.recordChunk(runId, tokens);
      onTrace?.({ event: 'stream_end', tokens });
    } catch (err) {
      onTrace?.({ event: 'stream_error', error: err });
    }

    return collector.finishRun(runId);
  },
};
