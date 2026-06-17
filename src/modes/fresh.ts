import type { SpeedTestConfig, RunMetrics, StreamTraceEvent } from '../types.js';
import type { MetricsCollector } from '../metrics.js';
import type { LanguageModel } from 'ai';
import type { ModeRunner } from './runner.js';
import { streamText } from 'ai';
import { formatTokenUsage, outputTokensFromUsage } from '../token-usage.js';

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
    const vlog = (msg: string) => { if (config.verbose) console.error(`[fresh] ${msg}`); };
    const collector = metricsFactory();
    const runId = collector.startRun();

    let firstChunkReceived = false;
    let streamTokenCount = 0;
    let chunkCount = 0;
    let fullResponse = '';

    onTrace?.({ event: 'stream_start' });
    vlog('stream started, waiting for first chunk...');

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
        chunkCount++;
        streamTokenCount += Math.max(1, Math.round(chunk.text.length / 4));
        fullResponse += chunk.text;
        if (!firstChunkReceived) {
          firstChunkReceived = true;
          collector.recordFirstToken(runId);
          onStream?.('first-token');
          onTrace?.({ event: 'stream_first_chunk', content: chunk.text, blockType: chunk.type });
          vlog(`first chunk received`);
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
      const usage = await result.usage;
      let tokens = streamTokenCount;
      if (tokens === 0) {
        tokens = outputTokensFromUsage(usage);
      }
      collector.recordChunk(runId, tokens);
      onTrace?.({ event: 'stream_end', tokens, content: fullResponse, usage });
      vlog(`upstream usage: ${formatTokenUsage(usage)}`);
      vlog(`stream end: ${chunkCount} chunks, ~${tokens} tokens`);
    } catch (err) {
      onTrace?.({ event: 'stream_error', error: err });
      vlog(`stream error: ${err instanceof Error ? err.message : String(err)}`);
    }

    return collector.finishRun(runId);
  },
};
