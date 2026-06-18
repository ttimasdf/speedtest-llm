import type { SpeedTestConfig, RunMetrics, StreamTraceEvent } from '../types.js';
import type { MetricsCollector } from '../metrics.js';
import type { LanguageModel } from 'ai';
import type { ModeRunner } from './runner.js';
import { streamText } from 'ai';
import { formatTokenUsage, outputTokensFromUsage } from '../token-usage.js';

export const prefillRunner: ModeRunner = {
  name: 'prefill',
  description:
    'Measures prefill speed (TTFT) under long context load and verifies instruction following',

  async run(
    _config: SpeedTestConfig,
    model: LanguageModel,
    metricsFactory: () => MetricsCollector,
    context: string,
    onStream?: (event: 'first-token' | 'chunk' | 'done', tokenCount?: number) => void,
    onTrace?: (event: StreamTraceEvent) => void,
    signal?: AbortSignal,
  ): Promise<RunMetrics> {
    const vlog = (msg: string) => { if (_config.verbose) console.error(`[prefill] ${msg}`); };
    const prompt =
      context +
      '\n\nINSTRUCTION: Reply with exactly the word "OK" and nothing else. No explanation, no prefix, no suffix — just "OK".';
    const messages = [{ role: 'user' as const, content: prompt }];

    const collector = metricsFactory();
    const runId = collector.startRun();

    let fullResponse = '';
    let firstChunk = true;
    let streamTokenCount = 0;
    let chunkCount = 0;

    onTrace?.({ event: 'stream_start' });
    vlog('stream started, waiting for first chunk...');

    const result = streamText({
      model,
      messages,
      maxOutputTokens: 10,
      maxRetries: 0,
      abortSignal: signal,
      onChunk({ chunk }) {
        if (chunk.type !== 'text-delta') {
          onTrace?.({ event: 'stream_chunk', blockType: chunk.type, block: chunk });
          return;
        }
        const tokenDelta = Math.max(1, Math.round(chunk.text.length / 4));
        streamTokenCount += tokenDelta;
        collector.recordChunk(runId, tokenDelta);
        chunkCount++;
        if (firstChunk) {
          collector.recordFirstToken(runId);
          firstChunk = false;
          onStream?.('first-token');
          onTrace?.({ event: 'stream_first_chunk', content: chunk.text, blockType: chunk.type });
          vlog(`first chunk received`);
        } else {
          onTrace?.({ event: 'stream_chunk', content: chunk.text, blockType: chunk.type });
        }
        fullResponse += chunk.text;
        onStream?.('chunk', tokenDelta);
      },
      onFinish() {
        onStream?.('done');
      },
    });

    try {
      for await (const _ of result.textStream) {
      }
      const usage = await result.usage;
      let tokens = streamTokenCount;
      if (tokens === 0) {
        tokens = outputTokensFromUsage(usage);
        collector.recordChunk(runId, tokens);
      }
      onTrace?.({ event: 'stream_end', tokens, content: fullResponse, usage });
      vlog(`upstream usage: ${formatTokenUsage(usage)}`);
      vlog(`stream end: ${chunkCount} chunks, ~${tokens} tokens, response="${fullResponse.trim()}"`);
    } catch (err) {
      onTrace?.({ event: 'stream_error', error: err });
      vlog(`stream error: ${err instanceof Error ? err.message : String(err)}`);
    }

    const runMetrics = collector.finishRun(runId);
    const instructionFollowed = fullResponse.trim() === 'OK';
    vlog(`instruction followed: ${instructionFollowed}`);

    return { ...runMetrics, instructionFollowed };
  },
};
