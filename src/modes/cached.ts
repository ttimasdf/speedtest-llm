import type { SpeedTestConfig, RunMetrics, StreamTraceEvent } from '../types.js';
import type { MetricsCollector } from '../metrics.js';
import type { LanguageModel } from 'ai';
import type { ModeRunner } from './runner.js';
import { streamText } from 'ai';
import { formatTokenUsage, outputTokensFromUsage } from '../token-usage.js';

export const cachedRunner: ModeRunner = {
  name: 'cached-long-context',
  description: 'Measures cached long-context generation speed (warmup + measured run)',

  async run(
    config: SpeedTestConfig,
    model: LanguageModel,
    metricsFactory: () => MetricsCollector,
    context: string,
    onStream?: (event: 'first-token' | 'chunk' | 'done') => void,
    onTrace?: (event: StreamTraceEvent) => void,
    signal?: AbortSignal,
  ): Promise<RunMetrics> {
    const vlog = (msg: string) => { if (config.verbose) console.error(`[cached] ${msg}`); };
    const prompt =
      context +
      '\n\nWrite a comprehensive, detailed essay about the history and evolution of computing, from the abacus to modern AI. Include specific dates, key figures, and technical milestones. Be thorough and expansive.';
    const messages = [{ role: 'user' as const, content: prompt }];

    vlog('sending warmup request...');
    try {
      const warmup = streamText({
        model,
        messages,
        maxOutputTokens: config.maxTokens,
        maxRetries: 0,
        abortSignal: signal,
      });
      for await (const _chunk of warmup.textStream) {}
      vlog('warmup completed');
    } catch (err) {
      console.warn(
        'Warmup request failed (some endpoints may not support caching):',
        err instanceof Error ? err.message : String(err),
      );
      vlog(`warmup failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const collector = metricsFactory();
    const runId = collector.startRun();

    onTrace?.({ event: 'stream_start' });
    vlog('measured stream started, waiting for first chunk...');

    let firstTokenRecorded = false;
    let streamTokenCount = 0;
    let chunkCount = 0;
    let fullResponse = '';

    const result = streamText({
      model,
      messages,
      maxOutputTokens: config.maxTokens,
      maxRetries: 0,
      abortSignal: signal,
      onChunk: ({ chunk }) => {
        if (chunk.type !== 'text-delta') {
          onTrace?.({ event: 'stream_chunk', blockType: chunk.type, block: chunk });
          return;
        }
        streamTokenCount += Math.max(1, Math.round(chunk.text.length / 4));
        chunkCount++;
        fullResponse += chunk.text;
        if (!firstTokenRecorded) {
          collector.recordFirstToken(runId);
          firstTokenRecorded = true;
          onStream?.('first-token');
          onTrace?.({ event: 'stream_first_chunk', content: chunk.text, blockType: chunk.type });
          vlog(`first chunk received`);
        } else {
          onTrace?.({ event: 'stream_chunk', content: chunk.text, blockType: chunk.type });
        }
        onStream?.('chunk');
      },
    });

    try {
      for await (const _chunk of result.textStream) {
      }

      const usage = await result.usage;
      let tokens = streamTokenCount;
      if (tokens === 0) {
        tokens = outputTokensFromUsage(usage);
      }
      collector.recordChunk(runId, tokens);
      onTrace?.({ event: 'stream_end', tokens, content: fullResponse, usage });
      onStream?.('done');
      vlog(`upstream usage: ${formatTokenUsage(usage)}`);
      vlog(`stream end: ${chunkCount} chunks, ~${tokens} tokens`);
    } catch (err) {
      onTrace?.({ event: 'stream_error', error: err });
      vlog(`stream error: ${err instanceof Error ? err.message : String(err)}`);
    }

    return collector.finishRun(runId);
  },
};
